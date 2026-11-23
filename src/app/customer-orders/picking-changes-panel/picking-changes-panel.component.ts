import { Component, HostListener, computed, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import {
  PICKING_CHANGE_LABELS,
  PickingChangeEntry,
  PickingChangeType,
  formatPickingQuantity,
} from './picking-changes.model';

interface PickingChangeRound {
  key: string;
  createdAt: string;
  pickerName: string;
  changes: PickingChangeEntry[];
}

@Component({
  selector: 'app-picking-changes-panel',
  imports: [DatePipe, MatIconModule],
  templateUrl: './picking-changes-panel.component.html',
  styleUrl: './picking-changes-panel.component.scss',
})
export class PickingChangesPanelComponent {
  changes = input<PickingChangeEntry[]>([]);

  readonly isOpen = signal(false);
  readonly labels = PICKING_CHANGE_LABELS;
  readonly formatQuantity = formatPickingQuantity;

  /** Ein Block pro Kommissionier-Abschluss, falls die Bestellung mehrfach kommissioniert wurde. */
  readonly rounds = computed<PickingChangeRound[]>(() => {
    const rounds = new Map<string, PickingChangeRound>();
    for (const change of this.changes()) {
      const pickerName = change.picker_user_name || 'Unbekannt';
      const key = `${change.created_at}|${pickerName}`;
      const round = rounds.get(key) ?? { key, createdAt: change.created_at, pickerName, changes: [] };
      round.changes.push(change);
      rounds.set(key, round);
    }
    return [...rounds.values()];
  });

  readonly counts = computed(() => {
    const counts = new Map<PickingChangeType, number>();
    for (const change of this.changes()) {
      counts.set(change.change_type, (counts.get(change.change_type) ?? 0) + 1);
    }
    return [...counts.entries()].map(([type, count]) => ({ type, count }));
  });

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
