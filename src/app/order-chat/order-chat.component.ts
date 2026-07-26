import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  inject,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CustomerArticle,
  OrderChatService,
  OrderIntakeDraft,
  OrderIntakeResponse,
  QuickReply,
  ProductOption,
} from './order-chat.service';

interface ChatMessage {
  direction: 'in' | 'out';
  body: string;
  orderId?: number | null;
}

const SESSION_KEY = 'order_chat_session_id';
const OPEN_KEY = 'order_chat_widget_open';
const MOBILE_QUERY = '(max-width: 640px)';
const TYPING_LABELS = [
  'schreibt …',
  'suche passende Artikel …',
  'prüfe Kundendaten …',
  'bereite Antwort vor …',
];

@Component({
  selector: 'app-order-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order-chat.component.html',
  styleUrl: './order-chat.component.scss',
})
export class OrderChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  private orderChatService = inject(OrderChatService);
  private host = inject(ElementRef<HTMLElement>);
  private zone = inject(NgZone);

  /** `widget` = Float unten rechts; `page` = volle Seite unter /order-chat */
  @Input() mode: 'widget' | 'page' = 'page';

  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;

  isMobile = false;
  draftExpanded = true;
  isOpen = false;
  confirmResetOpen = false;
  sessionReady = false;
  sessionId = '';
  phase = 'identify';
  customerNumber: string | null = null;
  draft: OrderIntakeDraft | null = null;
  messages: ChatMessage[] = [];
  quickReplies: QuickReply[] = [];
  productOptions: ProductOption[] = [];
  inputText = '';
  loading = false;
  typingLabel = TYPING_LABELS[0];
  error: string | null = null;
  sessionCloseHint: string | null = null;

  articleQuery = '';
  articles: CustomerArticle[] = [];
  articlesLoading = false;
  showArticles = false;
  /** Artikelliste als Fullscreen-Overlay (aufklappbar / einklappbar) */
  articlesFullscreen = false;
  selectedQty: Record<string, number> = {};
  private shouldScroll = false;
  private teardown: Array<() => void> = [];
  private previousBodyOverflow: string | null = null;
  private typingTimer: ReturnType<typeof setInterval> | null = null;
  private postOrderCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private postOrderHintTimer: ReturnType<typeof setInterval> | null = null;
  private sessionClosesAtMs: number | null = null;

  ngOnInit(): void {
    this.watchViewport();
    this.watchKeyboard();

    if (this.mode === 'page') {
      this.isOpen = true;
      this.ensureSession();
      return;
    }

    try {
      this.isOpen = localStorage.getItem(OPEN_KEY) === '1';
    } catch {
      this.isOpen = false;
    }
    if (this.isOpen) {
      this.ensureSession();
      this.applyScrollLock();
    }
  }

  ngOnDestroy(): void {
    this.stopTypingAnimation();
    this.clearPostOrderClose();
    this.releaseScrollLock();
    this.teardown.forEach((fn) => fn());
    this.teardown = [];
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  private watchViewport(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const query = window.matchMedia(MOBILE_QUERY);
    const apply = (matches: boolean) => {
      this.isMobile = matches;
      // Am Handy ist der Entwurf eingeklappt, damit Nachrichten und Eingabe Platz haben
      this.draftExpanded = !matches;
      // Nach Rotation oder Größenänderung muss die Scroll-Sperre passen
      if (matches && this.isOpen) this.applyScrollLock();
      else if (!matches) this.releaseScrollLock();
    };
    apply(query.matches);

    const onChange = (event: MediaQueryListEvent) => this.zone.run(() => apply(event.matches));
    query.addEventListener('change', onChange);
    this.teardown.push(() => query.removeEventListener('change', onChange));
  }

  /**
   * Die Bildschirmtastatur verkleinert auf Mobilgeräten nur den visuellen Viewport,
   * nicht das Layout. Ohne diese Korrektur verschwindet die Eingabezeile dahinter.
   */
  private watchKeyboard(): void {
    const viewport = typeof window !== 'undefined' ? window.visualViewport : undefined;
    if (!viewport) return;

    const onResize = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      this.host.nativeElement.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
      if (inset > 0) this.scrollToBottom();
    };

    this.zone.runOutsideAngular(() => {
      viewport.addEventListener('resize', onResize);
      viewport.addEventListener('scroll', onResize);
    });
    this.teardown.push(() => {
      viewport.removeEventListener('resize', onResize);
      viewport.removeEventListener('scroll', onResize);
    });
  }

  /** Verhindert, dass die Seite hinter dem Vollbild-Chat mitscrollt. */
  private applyScrollLock(): void {
    if (!this.isMobile || !this.isWidget || typeof document === 'undefined') return;
    if (this.previousBodyOverflow === null) {
      this.previousBodyOverflow = document.body.style.overflow;
    }
    document.body.style.overflow = 'hidden';
  }

  private releaseScrollLock(): void {
    if (typeof document === 'undefined' || this.previousBodyOverflow === null) return;
    document.body.style.overflow = this.previousBodyOverflow;
    this.previousBodyOverflow = null;
  }

  get canUseArticles(): boolean {
    return !!this.customerNumber && (this.phase === 'ordering' || this.phase === 'confirm_order');
  }

  get isWidget(): boolean {
    return this.mode === 'widget';
  }

  toggleOpen(): void {
    this.isOpen = !this.isOpen;
    try {
      localStorage.setItem(OPEN_KEY, this.isOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.isOpen) {
      this.ensureSession();
      this.shouldScroll = true;
      this.applyScrollLock();
    } else {
      this.releaseScrollLock();
    }
  }

  closeWidget(): void {
    if (!this.isWidget) return;
    this.isOpen = false;
    this.releaseScrollLock();
    try {
      localStorage.setItem(OPEN_KEY, '0');
    } catch {
      /* ignore */
    }
  }

  toggleDraft(): void {
    this.draftExpanded = !this.draftExpanded;
  }

  /** Artikelliste als Overlay: am Handy immer, am Desktop nur im Widget. */
  private get articlesPreferFullscreen(): boolean {
    return this.isMobile || this.isWidget;
  }

  private ensureSession(): void {
    if (this.sessionReady || this.loading) return;
    this.bootstrapSession(false);
  }

  private bootstrapSession(reset = false): void {
    const existing = localStorage.getItem(SESSION_KEY) || undefined;
    this.setLoading(true);
    this.orderChatService.createSession(existing, reset).subscribe({
      next: (res) => {
        localStorage.setItem(SESSION_KEY, res.sessionId);
        this.sessionId = res.sessionId;
        this.phase = res.phase;
        this.customerNumber = res.customerNumber || null;
        this.draft = res.draft || null;
        this.sessionReady = true;

        if (res.sessionClosesAt) {
          this.schedulePostOrderClose(res.sessionClosesAt, res.postOrderTtlMinutes);
        } else {
          this.clearPostOrderClose();
        }

        if (res.resumed) {
          this.orderChatService.getMessages(res.sessionId).subscribe({
            next: (history) => {
              this.messages = (history.messages || []).map((m) => ({
                direction: m.direction === 'in' ? 'in' : 'out',
                body: m.body,
                orderId: m.orderId,
              }));
              if (!this.messages.length && res.replyText) {
                this.messages.push({ direction: 'out', body: res.replyText });
              }
              this.shouldScroll = true;
              this.setLoading(false);
              if (this.canUseArticles) {
                this.showArticles = !this.articlesPreferFullscreen;
                this.loadArticles();
              }
            },
            error: (err) => {
              if (this.isSessionExpiredError(err)) {
                this.restartAfterExpiry();
                return;
              }
              if (res.replyText) {
                this.messages = [{ direction: 'out', body: res.replyText }];
              }
              this.setLoading(false);
            },
          });
          return;
        }

        this.applyResponse(res, { pushReply: !!res.replyText });
        this.setLoading(false);
      },
      error: (err) => {
        this.error = err?.error?.error || 'Chat konnte nicht gestartet werden.';
        this.setLoading(false);
      },
    });
  }

  sendQuickReply(reply: QuickReply): void {
    if (this.loading) return;
    this.inputText = reply.value;
    this.send();
  }

  selectProductOption(option: ProductOption, index: number): void {
    if (this.loading) return;
    this.inputText = String(index + 1);
    this.send();
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (img) img.style.display = 'none';
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text || !this.sessionId || this.loading) return;

    this.messages.push({ direction: 'in', body: text });
    this.inputText = '';
    this.quickReplies = [];
    this.productOptions = [];
    this.setLoading(true);
    this.error = null;
    this.shouldScroll = true;

    this.orderChatService.sendMessage(this.sessionId, text).subscribe({
      next: (res) => {
        this.applyResponse(res, { pushReply: true });
        this.setLoading(false);
        if (this.canUseArticles) {
          this.loadArticles();
        }
      },
      error: (err) => {
        if (this.isSessionExpiredError(err)) {
          this.restartAfterExpiry();
          return;
        }
        this.error = err?.error?.error || 'Nachricht fehlgeschlagen.';
        this.setLoading(false);
      },
    });
  }

  onArticleSearch(): void {
    if (!this.canUseArticles) return;
    this.loadArticles();
  }

  toggleArticles(): void {
    this.showArticles = !this.showArticles;
    if (!this.showArticles) {
      this.articlesFullscreen = false;
    } else if (this.canUseArticles) {
      this.articlesFullscreen = this.articlesPreferFullscreen;
      this.loadArticles();
    }
  }

  expandArticles(): void {
    if (!this.canUseArticles) return;
    this.showArticles = true;
    this.articlesFullscreen = true;
    this.loadArticles();
  }

  collapseArticles(): void {
    // Am Handy gibt es keine Seitenspalte — dort direkt zurück in den Chat
    if (this.isMobile) {
      this.closeArticles();
      return;
    }
    this.articlesFullscreen = false;
    this.showArticles = true;
  }

  closeArticles(): void {
    this.showArticles = false;
    this.articlesFullscreen = false;
  }

  addArticle(article: CustomerArticle): void {
    if (!this.sessionId || this.loading) return;
    const qty = this.selectedQty[article.article_number] || 1;
    this.setLoading(true);
    this.error = null;

    this.messages.push({
      direction: 'in',
      body: `${qty}× ${article.name} (${article.article_number})`,
    });
    this.shouldScroll = true;

    this.orderChatService.addDraftItem(this.sessionId, article.article_number, qty).subscribe({
      next: (res) => {
        this.applyResponse(res, { pushReply: true });
        this.setLoading(false);
        // Fullscreen bleibt offen zum Weiterwählen; kompakt im Widget nach Add schließen
        if (this.isWidget && !this.articlesFullscreen) {
          this.showArticles = false;
        }
      },
      error: (err) => {
        if (this.isSessionExpiredError(err)) {
          this.restartAfterExpiry();
          return;
        }
        this.error = err?.error?.error || 'Artikel konnte nicht hinzugefügt werden.';
        this.setLoading(false);
      },
    });
  }

  requestReset(): void {
    if (this.loading) return;
    this.confirmResetOpen = true;
  }

  cancelReset(): void {
    this.confirmResetOpen = false;
  }

  confirmReset(): void {
    this.confirmResetOpen = false;
    this.resetChat();
  }

  resetChat(): void {
    this.clearPostOrderClose();
    this.messages = [];
    this.quickReplies = [];
    this.productOptions = [];
    this.draft = null;
    this.customerNumber = null;
    this.articles = [];
    this.phase = 'identify';
    this.showArticles = false;
    this.articlesFullscreen = false;
    this.sessionReady = false;
    this.error = null;
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    this.bootstrapSession(true);
  }

  private loadArticles(): void {
    if (!this.sessionId) return;
    this.articlesLoading = true;
    const limit = this.articlesFullscreen ? 100 : 50;
    this.orderChatService.getCustomerArticles(this.sessionId, this.articleQuery, limit).subscribe({
      next: (res) => {
        this.articles = res.items || [];
        this.articlesLoading = false;
      },
      error: (err) => {
        this.articles = [];
        this.articlesLoading = false;
        if (this.isSessionExpiredError(err)) {
          this.restartAfterExpiry();
        }
      },
    });
  }

  private isSessionExpiredError(err: { status?: number; error?: { code?: string; error?: string } } | null): boolean {
    return (
      err?.status === 410 ||
      err?.error?.code === 'SESSION_EXPIRED' ||
      err?.error?.error === 'SESSION_EXPIRED'
    );
  }

  private setLoading(value: boolean): void {
    this.loading = value;
    if (value) {
      this.startTypingAnimation();
      this.shouldScroll = true;
    } else {
      this.stopTypingAnimation();
    }
  }

  private startTypingAnimation(): void {
    this.stopTypingAnimation();
    this.typingLabel = TYPING_LABELS[0];
    let index = 0;
    this.typingTimer = setInterval(() => {
      index = (index + 1) % TYPING_LABELS.length;
      this.typingLabel = TYPING_LABELS[index];
    }, 2200);
  }

  private stopTypingAnimation(): void {
    if (this.typingTimer) {
      clearInterval(this.typingTimer);
      this.typingTimer = null;
    }
    this.typingLabel = TYPING_LABELS[0];
  }

  private restartAfterExpiry(): void {
    this.clearPostOrderClose();
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    this.messages = [];
    this.quickReplies = [];
    this.productOptions = [];
    this.draft = null;
    this.customerNumber = null;
    this.articles = [];
    this.phase = 'identify';
    this.showArticles = false;
    this.articlesFullscreen = false;
    this.sessionReady = false;
    if (!this.error) {
      this.error = 'Sitzung abgelaufen — neuer Chat gestartet.';
    }
    this.bootstrapSession(false);
  }

  private applyResponse(res: OrderIntakeResponse, opts: { pushReply: boolean }): void {
    this.sessionId = res.sessionId;
    this.phase = res.phase;
    this.customerNumber = res.customerNumber || null;
    this.draft = res.draft || null;
    this.quickReplies = res.quickReplies || [];
    this.productOptions = res.productOptions || [];
    if (res.sessionClosesAt) {
      this.schedulePostOrderClose(res.sessionClosesAt, res.postOrderTtlMinutes);
    } else if (res.orderId == null && res.draft?.items?.length) {
      // Weiterbestellen hebt den Post-Order-Countdown auf
      this.clearPostOrderClose();
    }
    if (opts.pushReply && res.replyText) {
      this.messages.push({
        direction: 'out',
        body: res.replyText,
        orderId: res.orderId,
      });
      this.shouldScroll = true;
    }
    if (this.canUseArticles && !this.articlesPreferFullscreen) {
      this.showArticles = true;
    }
  }

  private schedulePostOrderClose(closesAt: string, ttlMinutes?: number | null): void {
    const closesAtMs = new Date(closesAt).getTime();
    if (Number.isNaN(closesAtMs)) return;

    this.clearPostOrderClose();
    this.sessionClosesAtMs = closesAtMs;
    this.updateSessionCloseHint(ttlMinutes);

    const delay = Math.max(closesAtMs - Date.now(), 0);
    this.postOrderCloseTimer = setTimeout(() => {
      this.zone.run(() => {
        this.error = 'Session nach Bestellung geschlossen — neuer Chat gestartet.';
        this.restartAfterExpiry();
      });
    }, delay);

    this.postOrderHintTimer = setInterval(() => {
      this.zone.run(() => this.updateSessionCloseHint(ttlMinutes));
    }, 15000);
  }

  private updateSessionCloseHint(ttlMinutes?: number | null): void {
    if (!this.sessionClosesAtMs) {
      this.sessionCloseHint = null;
      return;
    }
    const remainingMs = this.sessionClosesAtMs - Date.now();
    if (remainingMs <= 0) {
      this.sessionCloseHint = 'Chat wird gleich neu gestartet …';
      return;
    }
    const mins = Math.max(1, Math.ceil(remainingMs / 60000));
    const fallback = ttlMinutes || 5;
    this.sessionCloseHint =
      mins >= fallback
        ? `Nach der Bestellung schließt der Chat in ca. ${fallback} Min.`
        : `Chat schließt in ca. ${mins} Min. — oder einfach weiterbestellen.`;
  }

  private clearPostOrderClose(): void {
    if (this.postOrderCloseTimer) {
      clearTimeout(this.postOrderCloseTimer);
      this.postOrderCloseTimer = null;
    }
    if (this.postOrderHintTimer) {
      clearInterval(this.postOrderHintTimer);
      this.postOrderHintTimer = null;
    }
    this.sessionClosesAtMs = null;
    this.sessionCloseHint = null;
  }

  private scrollToBottom(): void {
    const el = this.scrollContainer?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
