export interface PickingAddressCustomer {
  street?: string;
  postal_code?: string;
  city?: string;
  name_addition?: string;
}

export interface PickingAddressOrder {
  shipping_address?: string;
  customer_street?: string;
  customer_postal_code?: string;
  customer_city?: string;
}

export function formatPickingAddress(
  order: PickingAddressOrder,
  customer?: PickingAddressCustomer | null
): string {
  const orderLines: string[] = [];

  if (order.customer_street?.trim()) {
    orderLines.push(order.customer_street.trim());
  }

  if (order.customer_postal_code || order.customer_city) {
    const cityLine = `${order.customer_postal_code || ''} ${order.customer_city || ''}`.trim();
    if (cityLine) {
      orderLines.push(cityLine);
    }
  }

  if (orderLines.length > 0) {
    return orderLines.join('\n');
  }

  const customerLines: string[] = [];

  if (customer?.name_addition?.trim()) {
    customerLines.push(customer.name_addition.trim());
  }

  if (customer?.street?.trim()) {
    customerLines.push(customer.street.trim());
  }

  if (customer?.postal_code || customer?.city) {
    const cityLine = `${customer.postal_code || ''} ${customer.city || ''}`.trim();
    if (cityLine) {
      customerLines.push(cityLine);
    }
  }

  if (customerLines.length > 0) {
    return customerLines.join('\n');
  }

  return (order.shipping_address || '').trim();
}
