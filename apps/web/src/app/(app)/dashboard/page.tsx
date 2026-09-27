'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  Handshake,
  IndianRupee,
  PiggyBank,
  ShoppingCart,
  Truck,
  Weight,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiGet } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/format';

interface Summary {
  totalDeals: number;
  totalQuantity: number;
  totalTradeValue: number;
  brokerageEarned: number;
  buyerBrokerage: number;
  sellerBrokerage: number;
  totalDeposits: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'pos';
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={`mt-1 truncate text-2xl font-semibold tracking-tight ${tone === 'pos' ? 'text-green-600' : ''}`}>
            {value}
          </p>
        </div>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  // One request — the API runs every dashboard query in parallel.
  const dash = useQuery({
    queryKey: ['dash', 'overview'],
    queryFn: () => apiGet<{
      summary: Summary;
      byMaterial: { productId: string | null; code: string; name: string; deals: number; qty: number; brokerage: number }[];
      monthly: { month: string; brokerage: number; qty: number }[];
      recentDeals: { id: string; dealNo: string; date: string; buyer: string; seller: string; product: string; qty: number; rate: number; brokerage: number }[];
      recent: { id: string; summary: string; action: string; createdAt: string }[];
    }>('/dashboard/overview'),
  });
  const L = dash.isLoading;
  const s = dash.data?.summary;
  const byMaterial = dash.data?.byMaterial ?? [];
  const maxBrokerage = Math.max(...byMaterial.map((m) => m.brokerage), 1);

  return (
    <div>
      <PageHeader title="Dashboard" description="Brokerage overview across all deals" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {L || !s ? (
          Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-[76px]" />)
        ) : (
          <>
            <StatCard label="Brokerage Earned" value={formatCurrency(s.brokerageEarned)} icon={Handshake} tone="pos" />
            <StatCard label="From Buyers" value={formatCurrency(s.buyerBrokerage)} icon={ShoppingCart} />
            <StatCard label="From Sellers" value={formatCurrency(s.sellerBrokerage)} icon={Truck} />
            <StatCard label="Total Deals" value={formatNumber(s.totalDeals, 0)} icon={Boxes} />
            <StatCard label="Total Quantity (MT)" value={formatNumber(s.totalQuantity, 0)} icon={Weight} />
            <StatCard label="Total Trade Value" value={formatCurrency(s.totalTradeValue)} icon={IndianRupee} />
            <StatCard label="Deposits" value={formatCurrency(s.totalDeposits)} icon={PiggyBank} />
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Brokerage (12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {L ? <Skeleton className="h-full" /> : (dash.data?.monthly ?? []).length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No deals in the last 12 months.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.data?.monthly ?? []}>
                    <XAxis dataKey="month" tickFormatter={(v) => formatDate(v, 'MMM yy')} fontSize={11} stroke="#94a3b8" />
                    <YAxis fontSize={11} stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(v) => formatDate(v, 'MMMM yyyy')} />
                    <Bar dataKey="brokerage" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Brokerage" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Brokerage by Material</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {byMaterial.slice(0, 8).map((m) => (
              <div key={m.productId ?? 'none'}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className="font-medium">{m.code}</span>{' '}
                    <span className="text-muted-foreground">· {formatNumber(m.qty, 0)} MT · {m.deals} deal{m.deals === 1 ? '' : 's'}</span>
                  </span>
                  <span className="shrink-0 font-medium">{formatCurrency(m.brokerage)}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${(m.brokerage / maxBrokerage) * 100}%` }} />
                </div>
              </div>
            ))}
            {L && <Skeleton className="h-32" />}
            {!L && byMaterial.length === 0 && <p className="text-sm text-muted-foreground">No deals yet.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent Deals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-card">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Deal</th>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Buyer</th>
                  <th className="px-4 py-2 font-semibold">Seller</th>
                  <th className="px-4 py-2 font-semibold">Material</th>
                  <th className="px-4 py-2 text-right font-semibold">Qty (MT)</th>
                  <th className="px-4 py-2 text-right font-semibold">Rate</th>
                  <th className="px-4 py-2 text-right font-semibold">Brokerage</th>
                </tr>
              </thead>
              <tbody>
                {(dash.data?.recentDeals ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{r.dealNo}</td>
                    <td className="whitespace-nowrap px-4 py-2">{formatDate(r.date)}</td>
                    <td className="whitespace-nowrap px-4 py-2">{r.buyer}</td>
                    <td className="whitespace-nowrap px-4 py-2">{r.seller}</td>
                    <td className="whitespace-nowrap px-4 py-2">{r.product}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formatNumber(r.qty, 3)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formatCurrency(r.rate)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{formatCurrency(r.brokerage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {L && <div className="p-4"><Skeleton className="h-24" /></div>}
            {!L && (dash.data?.recentDeals ?? []).length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No deals yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {(dash.data?.recent ?? []).map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1 inline-block size-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <p>{a.summary ?? a.action}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</p>
                </div>
              </li>
            ))}
            {L && <Skeleton className="h-32" />}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
