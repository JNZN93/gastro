export type PickItemStatus = 'pending' | 'partial' | 'picked' | 'unavailable';

export interface PickingOrderItem {
  product_id: number;
  quantity: number;
  price?: string;
  different_price?: string | null;
  product_name: string;
  product_article_number: string;
}

export interface PickingOrder {
  order_id: number;
  user_id?: number;
  email?: string;
  name?: string;
  company?: string;
  customer_number?: string;
  total_price?: string;
  fulfillment_type?: string;
  order_date?: string;
  created_at?: string;
  delivery_date?: string;
  status: string;
  customer_notes?: string;
  items: PickingOrderItem[];
}

export interface PickItemState {
  key: string;
  productId: number;
  articleNumber: string;
  productName: string;
  targetQuantity: number;
  pickedQuantity: number;
  status: PickItemStatus;
  note?: string;
  replacementArticleNumber?: string;
  replacementArticleName?: string;
}

export interface PickingState {
  orderId: number;
  orderFingerprint: string;
  startedAt: string;
  startedBy: string;
  completedAt?: string;
  items: PickItemState[];
}

export interface PickingProgress {
  done: number;
  total: number;
  percent: number;
}

export interface ScanResultFeedback {
  type: 'success' | 'error' | 'warning';
  message: string;
}
