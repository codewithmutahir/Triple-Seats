"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NAVY = "#1B2A4A";
const STATUS_COLORS = {
  lead: "#f59e0b",
  discussion: "#38bdf8",
  booked: "#10b981",
  completed: "#94a3b8"
};
const TYPE_COLORS = ["#1B2A4A", "#3d5a80", "#6b8cae", "#c4d4e0"];

export type RevenueChartPoint = {
  month: string;
  revenue: number;
  fullMonth: string;
};

export type TimelinePoint = {
  month: string;
  lead: number;
  discussion: number;
  booked: number;
  completed: number;
};

export type TypeChartPoint = {
  name: string;
  value: number;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

export function ReportsBarCharts({
  revenueChartData,
  timeline
}: {
  revenueChartData: RevenueChartPoint[];
  timeline: TimelinePoint[];
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg text-[#1B2A4A]">
            Revenue Last 6 Months
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="min-w-[480px] h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `$${(v as number) / 1000}k`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as RevenueChartPoint;
                      return (
                        <div className="rounded-md border bg-white px-3 py-2 text-sm shadow-sm">
                          {money.format(row.revenue)} in {row.fullMonth}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="revenue" fill={NAVY} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg text-[#1B2A4A]">
            Event Pipeline (Last 6 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="min-w-[480px] h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="lead" stackId="a" fill={STATUS_COLORS.lead} name="Lead" />
                  <Bar
                    dataKey="discussion"
                    stackId="a"
                    fill={STATUS_COLORS.discussion}
                    name="Discussion"
                  />
                  <Bar dataKey="booked" stackId="a" fill={STATUS_COLORS.booked} name="Booked" />
                  <Bar
                    dataKey="completed"
                    stackId="a"
                    fill={STATUS_COLORS.completed}
                    name="Completed"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export function ReportsTypePieChart({
  typeChartData,
  totalEventsByType
}: {
  typeChartData: TypeChartPoint[];
  totalEventsByType: number;
}) {
  return (
    <div className="relative mx-auto h-[240px] w-full max-w-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={typeChartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
          >
            {typeChartData.map((_, i) => (
              <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="font-heading text-2xl font-semibold text-[#1B2A4A]">
            {totalEventsByType}
          </p>
          <p className="text-xs text-muted-foreground">events</p>
        </div>
      </div>
    </div>
  );
}
