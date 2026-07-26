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
  OrderIntakeDraftItem,
  OrderIntakeResponse,
  QuickReply,
  ProductOption,
} from './order-chat.service';

interface ChatMessage {
  direction: 'in' | 'out';
  body: string;
  orderId?: number | null;
  /** Lokale Vorschau für gerade hochgeladene Fotos (nicht vom Server) */
  imagePreviewUrl?: string | null;
}

const SESSION_KEY = 'order_chat_session_id';
const OPEN_KEY = 'order_chat_widget_open';
const MOBILE_QUERY = '(max-width: 640px)';
const MAX_EXPIRY_RECOVERIES = 2;
const EXPIRY_WINDOW_MS = 60_000;
const TYPING_LABELS = [
  'schreibt …',
  'suche passende Artikel …',
  'prüfe Kundendaten …',
  'lese Foto …',
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
  /** Trefferliste einklappbar — bei neuen Optionen wieder aufklappen */
  choicesExpanded = true;
  isOpen = false;
  confirmResetOpen = false;
  sessionReady = false;
  sessionId = '';
  phase = 'identify';
  customerNumber: string | null = null;
  customerLabel: string | null = null;
  draft: OrderIntakeDraft | null = null;
  messages: ChatMessage[] = [];
  quickReplies: QuickReply[] = [];
  productOptions: ProductOption[] = [];
  optionQty: Record<string, number> = {};
  inputText = '';
  loading = false;
  typingLabel = TYPING_LABELS[0];
  error: string | null = null;
  sessionCloseHint: string | null = null;
  confirmSubmitOpen = false;

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
  private ephemeralErrorTimer: ReturnType<typeof setTimeout> | null = null;
  /** true während bewusstem Neu-Start — kein Ablauf-Hinweis überschreiben */
  private resettingSession = false;
  /** true während automatischer Recovery nach 410 — verhindert Doppel-Restarts */
  private recoveringExpiry = false;
  /** Nachricht, die nach Session-Neustart erneut gesendet wird */
  private pendingOutbound: string | null = null;
  private expiryRecoveries = 0;
  private expiryWindowStart = 0;

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
    this.clearEphemeralError();
    this.releaseScrollLock();
    this.teardown.forEach((fn) => fn());
    this.teardown = [];
    for (const msg of this.messages) {
      if (msg.imagePreviewUrl) {
        try {
          URL.revokeObjectURL(msg.imagePreviewUrl);
        } catch {
          /* ignore */
        }
      }
    }
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

  get showStartActions(): boolean {
    return (
      this.canUseArticles &&
      !this.loading &&
      !(this.draft?.items?.length) &&
      this.quickReplies.length > 0
    );
  }

  get composerPlaceholder(): string {
    if (!this.customerNumber) {
      return 'Firma oder Kundennummer …';
    }
    if (this.draft?.items?.length) {
      return 'Noch etwas dazu? z. B. 2× Zwiebel …';
    }
    return 'z. B. 5× Eisbergsalat — oder Foto senden';
  }

  get canSendImage(): boolean {
    return !!this.customerNumber && (this.phase === 'ordering' || this.phase === 'confirm_order');
  }

  get headerSubtitle(): string {
    if (this.customerLabel && this.customerNumber) {
      return this.customerLabel === this.customerNumber
        ? `Kunde ${this.customerNumber}`
        : `${this.customerLabel} · ${this.customerNumber}`;
    }
    if (this.customerNumber) return `Kunde ${this.customerNumber}`;
    return 'Bitte zuerst identifizieren';
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
    // Auf schmalen Screens nur eine Liste gleichzeitig offen
    if (this.draftExpanded && this.isMobile) {
      this.choicesExpanded = false;
    }
  }

  toggleChoices(): void {
    this.choicesExpanded = !this.choicesExpanded;
    if (this.choicesExpanded && this.isMobile) {
      this.draftExpanded = false;
    }
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
        this.customerLabel = res.customerLabel || null;
        this.draft = res.draft || null;
        this.sessionReady = true;
        this.resettingSession = false;
        this.recoveringExpiry = false;
        this.error = null;

        if (res.sessionClosesAt) {
          this.schedulePostOrderClose(res.sessionClosesAt, res.postOrderTtlMinutes);
        } else {
          this.clearPostOrderClose();
        }

        if (res.resumed) {
          this.quickReplies = res.quickReplies || [];
          this.productOptions = res.productOptions || [];
          if (this.productOptions.length) {
            for (const option of this.productOptions) {
              if (!this.optionQty[option.article_number]) {
                this.optionQty[option.article_number] = 1;
              }
            }
            this.choicesExpanded = true;
            this.draftExpanded = false;
          } else {
            this.choicesExpanded = false;
          }
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
              this.flushPendingOutbound();
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
              this.flushPendingOutbound();
            },
          });
          return;
        }

        this.applyResponse(res, { pushReply: !!res.replyText });
        this.setLoading(false);
        this.flushPendingOutbound();
      },
      error: (err) => {
        this.resettingSession = false;
        this.recoveringExpiry = false;
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

  selectProductOption(option: ProductOption, _index?: number): void {
    if (this.loading) return;
    this.addProductOption(option);
  }

  optionQuantity(articleNumber: string): number {
    return this.optionQty[articleNumber] || 1;
  }

  bumpOptionQty(articleNumber: string, delta: number, event?: Event): void {
    event?.stopPropagation();
    const next = Math.max(1, (this.optionQty[articleNumber] || 1) + delta);
    this.optionQty[articleNumber] = next;
  }

  setOptionQty(articleNumber: string, value: number | string, event?: Event): void {
    event?.stopPropagation();
    const qty = Math.max(1, Number(value) || 1);
    this.optionQty[articleNumber] = qty;
  }

  addProductOption(option: ProductOption, event?: Event): void {
    event?.stopPropagation();
    if (!this.sessionId || this.loading) return;
    const qty = this.optionQuantity(option.article_number);
    this.setLoading(true);
    this.error = null;
    this.messages.push({
      direction: 'in',
      body: `${qty}× ${option.name} (${option.article_number})`,
    });
    this.productOptions = [];
    this.shouldScroll = true;

    this.orderChatService.addDraftItem(this.sessionId, option.article_number, qty).subscribe({
      next: (res) => {
        this.applyResponse(res, { pushReply: true });
        this.setLoading(false);
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

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (img) img.style.display = 'none';
  }

  bumpDraftQty(item: OrderIntakeDraftItem, delta: number): void {
    if (!this.sessionId || this.loading) return;
    const next = Number(item.quantity) + delta;
    if (next <= 0) {
      this.removeDraftItem(item);
      return;
    }
    this.updateDraftQty(item, next);
  }

  updateDraftQty(item: OrderIntakeDraftItem, quantity: number | string): void {
    if (!this.sessionId || this.loading) return;
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      this.removeDraftItem(item);
      return;
    }
    this.setLoading(true);
    this.error = null;
    this.orderChatService.updateDraftItem(this.sessionId, item.article_number, qty).subscribe({
      next: (res) => {
        this.applyResponse(res, { pushReply: false });
        this.setLoading(false);
      },
      error: (err) => {
        if (this.isSessionExpiredError(err)) {
          this.restartAfterExpiry();
          return;
        }
        this.error = err?.error?.error || 'Menge konnte nicht geändert werden.';
        this.setLoading(false);
      },
    });
  }

  removeDraftItem(item: OrderIntakeDraftItem): void {
    if (!this.sessionId || this.loading) return;
    this.setLoading(true);
    this.error = null;
    this.orderChatService.removeDraftItem(this.sessionId, item.article_number).subscribe({
      next: (res) => {
        this.applyResponse(res, { pushReply: false });
        this.setLoading(false);
      },
      error: (err) => {
        if (this.isSessionExpiredError(err)) {
          this.restartAfterExpiry();
          return;
        }
        this.error = err?.error?.error || 'Position konnte nicht entfernt werden.';
        this.setLoading(false);
      },
    });
  }

  requestSubmit(): void {
    if (this.loading || !this.draft?.items?.length) return;
    this.confirmSubmitOpen = true;
  }

  cancelSubmit(): void {
    this.confirmSubmitOpen = false;
  }

  confirmSubmit(): void {
    this.confirmSubmitOpen = false;
    this.submitDraft();
  }

  submitDraft(): void {
    if (!this.sessionId || this.loading || !this.draft?.items?.length) return;
    this.setLoading(true);
    this.error = null;
    this.messages.push({ direction: 'in', body: 'Ja, bitte absenden' });
    this.shouldScroll = true;
    this.orderChatService.submitDraft(this.sessionId).subscribe({
      next: (res) => {
        this.applyResponse(res, { pushReply: true });
        this.setLoading(false);
      },
      error: (err) => {
        if (this.isSessionExpiredError(err)) {
          this.restartAfterExpiry();
          return;
        }
        this.error = err?.error?.error || 'Auftrag konnte nicht angelegt werden.';
        this.setLoading(false);
      },
    });
  }

  openMyArticles(): void {
    if (!this.canUseArticles) return;
    this.expandArticles();
  }

  onStartAction(reply: QuickReply): void {
    if (this.loading) return;
    // „Meine Artikel“ öffnet die Liste direkt statt einen Chat-Zug zu brauchen
    if (/artikel|items|ürün|articles|материалы|товары/i.test(reply.label) || /normalerweise|usually|sipariş ediyorum/i.test(reply.value)) {
      this.openMyArticles();
      return;
    }
    this.sendQuickReply(reply);
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text || this.loading) return;

    // Session noch nicht bereit (Neustart läuft) — merken und nachholen
    if (!this.sessionId || !this.sessionReady) {
      this.pendingOutbound = text;
      this.inputText = '';
      this.messages.push({ direction: 'in', body: text });
      this.shouldScroll = true;
      if (!this.recoveringExpiry && !this.resettingSession) {
        this.bootstrapSession(false);
      }
      return;
    }

    this.sendText(text);
  }

  onImagePicked(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (input) input.value = '';
    if (!file || this.loading) return;

    if (!this.canSendImage) {
      this.showEphemeralError('Bitte zuerst Kunde bestätigen, dann Foto senden.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.showEphemeralError('Bitte eine Bilddatei wählen.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      this.showEphemeralError('Bild ist zu groß (max. 8 MB).');
      return;
    }

    this.sendImage(file);
  }

  private sendImage(file: File): void {
    if (!this.sessionId || this.loading) return;

    const caption = this.inputText.trim();
    const previewUrl = URL.createObjectURL(file);
    this.messages.push({
      direction: 'in',
      body: caption || 'Foto gesendet',
      imagePreviewUrl: previewUrl,
    });
    this.inputText = '';
    this.quickReplies = [];
    this.productOptions = [];
    this.setLoading(true);
    this.error = null;
    this.shouldScroll = true;

    this.orderChatService.sendImage(this.sessionId, file, caption).subscribe({
      next: (res) => {
        this.expiryRecoveries = 0;
        if (res.vision?.displayLabel) {
          const last = this.messages[this.messages.length - 1];
          if (last?.direction === 'in' && last.imagePreviewUrl === previewUrl) {
            last.body = res.vision.displayLabel;
          }
        }
        this.applyResponse(res, { pushReply: true });
        this.setLoading(false);
        if (this.canUseArticles) {
          this.loadArticles();
        }
      },
      error: (err) => {
        if (this.isSessionExpiredError(err)) {
          this.showEphemeralError('Session abgelaufen — bitte Foto erneut senden.');
          this.restartAfterExpiry();
          return;
        }
        this.error = err?.error?.error || 'Foto konnte nicht analysiert werden.';
        this.setLoading(false);
      },
    });
  }

  private sendText(text: string): void {
    if (!text || !this.sessionId || this.loading) return;

    const alreadyShown = this.messages.some(
      (m, i) => m.direction === 'in' && m.body === text && i === this.messages.length - 1
    );
    if (!alreadyShown) {
      this.messages.push({ direction: 'in', body: text });
    }
    this.inputText = '';
    this.quickReplies = [];
    this.productOptions = [];
    this.setLoading(true);
    this.error = null;
    this.shouldScroll = true;

    this.orderChatService.sendMessage(this.sessionId, text).subscribe({
      next: (res) => {
        this.expiryRecoveries = 0;
        this.applyResponse(res, { pushReply: true });
        this.setLoading(false);
        if (this.canUseArticles) {
          this.loadArticles();
        }
      },
      error: (err) => {
        if (this.isSessionExpiredError(err)) {
          // Nachricht nach frischer Session erneut senden — nicht stillschweigend verwerfen
          this.pendingOutbound = text;
          this.restartAfterExpiry();
          return;
        }
        this.error = err?.error?.error || 'Nachricht fehlgeschlagen.';
        this.setLoading(false);
      },
    });
  }

  private flushPendingOutbound(): void {
    const text = this.pendingOutbound?.trim();
    if (!text || !this.sessionId || !this.sessionReady || this.loading) return;
    this.pendingOutbound = null;
    // Kurz warten, damit Welcome-Bubble zuerst gerendert ist
    setTimeout(() => {
      this.zone.run(() => {
        if (!this.sessionId || this.loading) {
          this.pendingOutbound = text;
          return;
        }
        this.sendText(text);
      });
    }, 50);
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
    this.error = null;
    this.resetChat();
  }

  resetChat(): void {
    this.resettingSession = true;
    this.recoveringExpiry = false;
    this.pendingOutbound = null;
    this.clearPostOrderClose();
    this.clearEphemeralError();
    this.messages = [];
    this.quickReplies = [];
    this.productOptions = [];
    this.draft = null;
    this.customerNumber = null;
    this.customerLabel = null;
    this.articles = [];
    this.optionQty = {};
    this.confirmSubmitOpen = false;
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
    if (this.resettingSession || this.recoveringExpiry) return;

    // Wenn auch die frische Session sofort wieder 410 liefert, würde jeder
    // Neustart den nächsten auslösen — hier abbrechen statt endlos zu loopen.
    const now = Date.now();
    if (now - this.expiryWindowStart > EXPIRY_WINDOW_MS) {
      this.expiryWindowStart = now;
      this.expiryRecoveries = 0;
    }
    this.expiryRecoveries += 1;
    if (this.expiryRecoveries > MAX_EXPIRY_RECOVERIES) {
      this.pendingOutbound = null;
      this.sessionReady = false;
      this.setLoading(false);
      this.error = 'Der Chat lässt sich gerade nicht neu starten. Bitte die Seite neu laden.';
      return;
    }

    this.recoveringExpiry = true;
    this.clearPostOrderClose();
    // Alte ID sofort ungültig machen — sonst gehen weitere Requests auf die tote Session
    this.sessionId = '';
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    // pendingOutbound behalten — wird nach Neustart erneut gesendet
    this.quickReplies = [];
    this.productOptions = [];
    this.draft = null;
    this.customerNumber = null;
    this.customerLabel = null;
    this.articles = [];
    this.optionQty = {};
    this.confirmSubmitOpen = false;
    this.phase = 'identify';
    this.showArticles = false;
    this.articlesFullscreen = false;
    this.sessionReady = false;
    // Nachrichten erst leeren, wenn wir neu bootstrappen — pending Text bleibt über pendingOutbound
    this.messages = [];
    this.showEphemeralError('Sitzung war abgelaufen — starte neu und sende Ihre Nachricht erneut …');
    this.bootstrapSession(false);
  }

  private showEphemeralError(message: string): void {
    this.clearEphemeralError();
    this.error = message;
    this.ephemeralErrorTimer = setTimeout(() => {
      this.zone.run(() => {
        if (this.error === message) this.error = null;
        this.ephemeralErrorTimer = null;
      });
    }, 4000);
  }

  private clearEphemeralError(): void {
    if (this.ephemeralErrorTimer) {
      clearTimeout(this.ephemeralErrorTimer);
      this.ephemeralErrorTimer = null;
    }
  }

  private applyResponse(res: OrderIntakeResponse, opts: { pushReply: boolean }): void {
    this.sessionId = res.sessionId;
    this.phase = res.phase;
    this.customerNumber = res.customerNumber || null;
    this.customerLabel = res.customerLabel || this.customerLabel;
    this.draft = res.draft || null;
    this.quickReplies = res.quickReplies || [];
    this.productOptions = res.productOptions || [];
    if (this.productOptions.length) {
      for (const option of this.productOptions) {
        if (!this.optionQty[option.article_number]) {
          this.optionQty[option.article_number] = 1;
        }
      }
      // Neue Treffer: Auswahl aufklappen, Warenkorb einklappen
      this.choicesExpanded = true;
      this.draftExpanded = false;
    } else {
      this.choicesExpanded = false;
    }
    if (res.sessionClosesAt) {
      this.schedulePostOrderClose(res.sessionClosesAt, res.postOrderTtlMinutes);
    } else {
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
        if (this.resettingSession) return;
        this.showEphemeralError('Session nach Bestellung geschlossen — neuer Chat gestartet.');
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
