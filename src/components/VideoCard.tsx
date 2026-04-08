import { Download, Eye, Heart, Play, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type VideoStatus = "pending" | "downloading" | "completed" | "error";

export interface VideoData {
  id: string;
  title: string;
  thumbnail: string;
  views: string;
  likes: string;
  duration: string;
  author: string;
  status: VideoStatus;
  url: string;
}

const statusConfig: Record<VideoStatus, { label: string; className: string; icon: React.ReactNode }> = {
  pending: { label: "Pendente", className: "bg-muted text-muted-foreground", icon: null },
  downloading: { label: "Baixando...", className: "bg-info/20 text-info", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { label: "Concluído", className: "bg-success/20 text-success", icon: <CheckCircle className="h-3 w-3" /> },
  error: { label: "Erro", className: "bg-destructive/20 text-destructive", icon: null },
};

interface VideoCardProps {
  video: VideoData;
  onDownload: (id: string) => void;
}

export const VideoCard = ({ video, onDownload }: VideoCardProps) => {
  const status = statusConfig[video.status];

  return (
    <div className="group relative rounded-lg border bg-card overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-secondary overflow-hidden">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-background/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="h-10 w-10 text-primary fill-primary" />
        </div>
        <span className="absolute bottom-2 right-2 bg-background/80 text-foreground text-xs font-mono px-1.5 py-0.5 rounded">
          {video.duration}
        </span>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <h3 className="text-sm font-medium leading-tight line-clamp-2 text-foreground">
          {video.title}
        </h3>
        <p className="text-xs text-muted-foreground">@{video.author}</p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> {video.views}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> {video.likes}
          </span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <Badge variant="secondary" className={`text-[10px] gap-1 ${status.className}`}>
            {status.icon}
            {status.label}
          </Badge>
          <Button
            size="sm"
            variant={video.status === "completed" ? "secondary" : "default"}
            className="h-7 text-xs gap-1"
            onClick={() => onDownload(video.id)}
            disabled={video.status === "downloading"}
          >
            <Download className="h-3 w-3" />
            {video.status === "completed" ? "Baixado" : "Baixar"}
          </Button>
        </div>
      </div>
    </div>
  );
};
