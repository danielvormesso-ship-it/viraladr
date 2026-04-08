import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  trend?: string;
}

export const StatsCard = ({ title, value, subtitle, icon: Icon, trend }: StatsCardProps) => (
  <div className="rounded-lg border bg-card p-4 space-y-2">
    <div className="flex items-center justify-between">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
      <Icon className="h-4 w-4 text-primary" />
    </div>
    <div className="flex items-end gap-2">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {trend && (
        <span className="text-xs font-medium text-success mb-1">{trend}</span>
      )}
    </div>
    <p className="text-xs text-muted-foreground">{subtitle}</p>
  </div>
);
