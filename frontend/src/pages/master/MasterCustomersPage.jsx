import { useEffect, useState } from 'react';
import { Search, Star, MapPin, User } from 'lucide-react';
import api from '../../lib/api';

export function MasterCustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await api.get(`/customers?search=${search}&limit=50`);
      setCustomers(res.data.customers);
      setTotal(res.data.total);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="section-title">Customers</h1>
          <p className="text-gray-500 text-sm mt-1">{total.toLocaleString()} total customers in the central history database</p>
        </div>
      </div>

      <div className="relative mb-6 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9" placeholder="Search by name, phone, or city..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-dark-700/50">
            <tr>{['Phone', 'Customer', 'Location', 'Last Visit', 'Points', 'Visits', 'Total Spent'].map((heading) => <th key={heading} className="table-head">{heading}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-600">Loading...</td></tr>
            ) : customers.map((customer) => (
              <tr key={customer._id} className="table-row">
                <td className="table-cell font-mono text-brand-400">{customer.phone_no}</td>
                <td className="table-cell">
                  <div className="font-medium text-white">{customer.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <User size={11} />
                    {[customer.gender, customer.age ? `${customer.age} yrs` : ''].filter(Boolean).join(' · ') || 'Profile pending'}
                  </div>
                </td>
                <td className="table-cell text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-gray-600" />
                    <span>{[customer.city, customer.state].filter(Boolean).join(', ') || 'NA'}</span>
                  </div>
                </td>
                <td className="table-cell text-gray-600 text-xs">{customer.last_visit ? new Date(customer.last_visit).toLocaleDateString('en-IN') : 'NA'}</td>
                <td className="table-cell">
                  <div className="flex items-center gap-1.5">
                    <Star size={12} className="text-yellow-400" />
                    <span className="font-mono text-yellow-400">{customer.total_points}</span>
                    <span className="text-gray-600 text-xs">pts</span>
                  </div>
                </td>
                <td className="table-cell font-mono">{customer.total_orders}</td>
                <td className="table-cell font-mono text-green-400">Rs. {customer.total_spent?.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default MasterCustomersPage;
