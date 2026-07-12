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
  shipping_address?: string;
  status: string;
  customer_notes?: string;
  picker_user_id?: number | null;
  picker_user_name?: string | null;
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
  price?: number;
  differentPrice?: number | null;
  replacementArticleNumber?: string;
  replacementArticleName?: string;
  category?: string;
  customField1?: string;
  isPfandLine?: boolean;
  parentItemKey?: string;
  isAddedLine?: boolean;
  pfandEnabled?: boolean;
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

export interface PickingSyncItem {
  product_id: number;
  quantity: number;
  price?: number;
  different_price?: number | null;
  description?: string;
  remove?: boolean;
  replacement_article_number?: string;
  replacement_article_name?: string;
}
