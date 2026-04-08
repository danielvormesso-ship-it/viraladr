import { supabase } from '@/integrations/supabase/client';

export interface KwaiVideo {
  id: string;
  kwai_id: string | null;
  title: string;
  thumbnail: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  duration: string | null;
  author: string | null;
  video_url: string | null;
  source_url: string | null;
  status: string;
  created_at: string;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

export const kwaiApi = {
  async fetchVideos(minViews = 0, limit = 400): Promise<KwaiVideo[]> {
    const { data, error } = await supabase
      .from('kwai_videos')
      .select('*')
      .gte('views', minViews)
      .order('views', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as KwaiVideo[];
  },

  async scrapeByHashtag(hashtag: string, limit = 200): Promise<{ success: boolean; videos_found: number }> {
    const { data, error } = await supabase.functions.invoke('scrape-kwai', {
      body: { hashtag, limit },
    });
    if (error) throw error;
    return data;
  },

  async scrapeNewVideos(): Promise<{ success: boolean; videos_found: number }> {
    return this.scrapeByHashtag('viral', 200);
  },

  async getVideoCount(minViews = 0): Promise<number> {
    const { count, error } = await supabase
      .from('kwai_videos')
      .select('*', { count: 'exact', head: true })
      .gte('views', minViews);
    if (error) throw error;
    return count || 0;
  },

  formatNumber,
};
