import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { loadCompletedOrderIds, loadPickingProgress } from '../utils/workflow';

interface Order {
  SalesOrderID: string;
  CustomerID?: string;
  OrderDate?: string;
  TotalAmount?: number;
  Currency?: string;
}

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [completedOrderIds, setCompletedOrderIds] = useState<string[]>(loadCompletedOrderIds());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<{ value: any[] }>('/api/salesorders');
      const sapOrders = response.data?.value || [];
      const normalized = sapOrders.map((order: any) => ({
        ...order,
        SalesOrderID: String(order.SalesOrderID ?? order.SalesOrder),
        CustomerID: order.CustomerID ?? order.SoldToParty,
        OrderDate: order.OrderDate ?? order.SalesOrderDate,
        TotalAmount: order.TotalAmount ?? order.TotalNetAmount,
        Currency: order.Currency ?? order.TransactionCurrency,
      }));
      setOrders(normalized);
      localStorage.setItem('woolworths_orders', JSON.stringify(normalized));
      setCompletedOrderIds(loadCompletedOrderIds());
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = orders.filter((order) =>
    order.SalesOrderID?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.CustomerID?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container-fluid">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h2 className="mb-1">Orders</h2>
          <p className="text-muted mb-0">Picker · Step 1 of 4: open an order and pick its items. Report any shelf issue from the item row.</p>
        </div>
        <div className="d-flex gap-2">
          <input
            type="search"
            aria-label="Search orders"
            placeholder="Search order or customer"
            className="form-control"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <button className="btn btn-outline-primary text-nowrap" onClick={() => void fetchOrders()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && <div className="alert alert-info">Loading orders from SAP…</div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && filteredOrders.length === 0 && (
        <div className="alert alert-info text-center">No orders found. Try another search.</div>
      )}

      <div className="row row-cols-1 row-cols-sm-2 row-cols-xl-3 g-3">
        {filteredOrders.map((order) => {
          const completed = completedOrderIds.includes(order.SalesOrderID);
          const progress = loadPickingProgress()[order.SalesOrderID] || {};
          const started = Object.values(progress).some((status) => status === 'Picked' || status === 'Issue Reported');
          const orderStatus = completed ? 'Completed' : started ? 'Picking in progress' : 'Not started';
          return (
            <div className="col" key={order.SalesOrderID}>
              <article className="card h-100 shadow-sm">
                <div className="card-body d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <h5 className="card-title">Order {order.SalesOrderID}</h5>
                    <span className={`badge ${completed ? 'bg-success' : started ? 'bg-primary' : 'bg-secondary'}`}>
                      {orderStatus}
                    </span>
                  </div>
                  <p className="mb-1">Customer: {order.CustomerID || 'N/A'}</p>
                  <p className="mb-1">Order date: {order.OrderDate || 'N/A'}</p>
                  <p className="mb-3">Total: {order.TotalAmount ?? 0} {order.Currency || ''}</p>
                  <Link
                    className="btn btn-primary mt-auto"
                    to="/order-details"
                    state={{ orderId: order.SalesOrderID }}
                  >
                    {completed ? 'View completed order' : 'Open order'}
                  </Link>
                </div>
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OrdersPage;
