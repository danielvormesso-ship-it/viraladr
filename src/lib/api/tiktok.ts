import { supabase } from '@/integrations/supabase/client';

export interface TikTokVideo {
  id: string;
  tiktok_id: string | null;
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
  owner_user_id?: string | null;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function normalizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  return url.trim().toLowerCase().split('#')[0].split('?')[0].replace(/\/+$/, '');
}

export function getVideoKey(video: TikTokVideo): string {
  if (video.tiktok_id) return `id:${video.tiktok_id}`;
  const source = normalizeUrl(video.source_url);
  if (source) return `source:${source}`;
  const direct = normalizeUrl(video.video_url);
  if (direct) return `video:${direct}`;
  return `meta:${(video.author || '').toLowerCase()}|${(video.title || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

export function dedupeVideos(videos: TikTokVideo[]): TikTokVideo[] {
  const seen = new Set<string>();
  return videos.filter((video) => {
    const key = getVideoKey(video);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Usuário não autenticado');
  return user.id;
}

async function triggerBrowserDownload(url: string, filename: string) {
  let blobUrl: string | null = null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    // Fallback: open in new tab
    window.open(url, '_blank');
    return true;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

export const tiktokApi = {
  async fetchVideos(minViews = 0, limit = 400): Promise<TikTokVideo[]> {
    const userId = await getCurrentUserId();

    const { data, error }: any = await (supabase as any)
      .from('tiktok_videos')
      .select('*')
      .eq('owner_user_id', userId)
      .gte('views', minViews)
      .order('views', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return dedupeVideos((data || []) as TikTokVideo[]);
  },

  async scrapeByHashtag(
    hashtag: string,
    limit = 50,
    editor?: string,
    forceRefresh = false,
    lightMode = false,
    cursor?: string | null
  ): Promise<{ success: boolean; videos_found: number; new_scraped: number; from_cache: boolean; videos: TikTokVideo[]; next_cursor?: string | null }> {
    const { data, error } = await supabase.functions.invoke('scrape-tiktok-apify', {
      body: { hashtag, limit, editor, force: forceRefresh, light: lightMode, cursor },
    });
    if (error) throw error;

    const videos = shuffleArray(dedupeVideos((data?.videos || []) as TikTokVideo[]));
    return {
      ...data,
      videos,
      videos_found: videos.length,
      next_cursor: data?.next_cursor || null,
    };
  },

  async scrapeByKeyword(keyword: string, limit = 50, editor?: string): Promise<{ success: boolean; videos_found: number }> {
    const { data, error } = await supabase.functions.invoke('scrape-tiktok-apify', {
      body: { keyword, limit, editor },
    });
    if (error) throw error;
    return data;
  },

  async scrapeForYou(
    quantity: number,
    filters: { minViews?: number; minLikes?: number; minShares?: number; minComments?: number } = {}
  ): Promise<{ success: boolean; new_scraped: number; total_available: number; videos: TikTokVideo[] }> {
    const { data, error } = await supabase.functions.invoke('scrape-tiktok-foryou', {
      body: {
        quantity,
        minViews: filters.minViews || 0,
        minLikes: filters.minLikes || 0,
        minShares: filters.minShares || 0,
        minComments: filters.minComments || 0,
      },
    });
    if (error) throw error;
    const videos = dedupeVideos((data?.videos || []) as TikTokVideo[]);
    return { ...data, videos };
  },

  async downloadVideo(video: TikTokVideo): Promise<{ success: boolean; error?: string }> {
    const videoUrl = video.source_url || (video.tiktok_id ? `https://www.tiktok.com/@user/video/${video.tiktok_id}` : null);
    if (!videoUrl) return { success: false, error: 'Sem URL do vídeo' };

    // Get no-watermark download URL from edge function
    const { data, error } = await supabase.functions.invoke('download-tiktok', {
      body: { video_url: videoUrl, tiktok_id: video.tiktok_id, mode: 'url' },
    });

    if (error) return { success: false, error: error.message };
    if (!data?.success || !data?.download_url) {
      return { success: false, error: data?.error || 'Falha ao obter link de download' };
    }

    // Trigger browser download
    const safeName = (video.title || 'tiktok_video').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 50);
    const filename = `${safeName}_${video.tiktok_id || 'video'}.mp4`;
    await triggerBrowserDownload(data.download_url, filename);

    return { success: true };
  },

  async assignVideoToEditor(videoId: string, editorName: string): Promise<void> {
    const { error } = await supabase
      .from('video_assignments' as any)
      .insert({ video_id: videoId, editor_name: editorName });
    if (error) throw error;
  },

  async deleteVideos(ids: string[]): Promise<void> {
    const validIds = ids.filter(id => id != null && id !== 'undefined' && id !== '');
    if (validIds.length === 0) return;
    const userId = await getCurrentUserId();

    const { error } = await supabase
      .from('tiktok_videos' as any)
      .delete()
      .eq('owner_user_id', userId)
      .in('id', validIds);

    if (error) throw error;
  },

  async getSeenVideoIds(): Promise<Set<string>> {
    try {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('seen_videos')
        .select('tiktok_id')
        .eq('user_id', userId);
      if (error) throw error;
      return new Set<string>((data || []).map((r: any) => r.tiktok_id));
    } catch (err) {
      console.warn('Erro ao ler seen_videos:', err);
      return new Set<string>();
    }
  },

  async markVideosSeen(tiktokIds: string[]): Promise<void> {
    const validIds = tiktokIds.filter(id => id != null && id !== '');
    if (validIds.length === 0) return;
    try {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase.functions.invoke('save-seen-videos', {
        body: { tiktok_ids: validIds, table: 'seen_videos', user_id: userId },
      });
      if (error) console.error('[markVideosSeen] edge function error:', error);
    } catch (err) {
      console.warn('Erro ao salvar seen_videos:', err);
    }
  },

  async getUsedVideoIds(): Promise<Set<string>> {
    try {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('used_videos')
        .select('tiktok_id')
        .eq('user_id', userId);
      if (error) throw error;
      return new Set<string>((data || []).map((r: any) => r.tiktok_id));
    } catch (err) {
      console.warn('Erro ao ler used_videos:', err);
      return new Set<string>();
    }
  },

  async markVideosUsed(tiktokIds: string[]): Promise<void> {
    const validIds = tiktokIds.filter(id => id != null && id !== '');
    if (validIds.length === 0) return;
    try {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase.functions.invoke('save-seen-videos', {
        body: { tiktok_ids: validIds, table: 'used_videos', user_id: userId },
      });
      if (error) console.error('[markVideosUsed] edge function error:', error);
    } catch (err) {
      console.warn('Erro ao salvar used_videos:', err);
    }
  },

  async getVideoCount(minViews = 0): Promise<number> {
    const userId = await getCurrentUserId();

    const { count, error } = await supabase
      .from('tiktok_videos' as any)
      .select('*', { count: 'exact', head: true })
      .eq('owner_user_id', userId)
      .gte('views', minViews);

    if (error) throw error;
    return count || 0;
  },

  async discoverHashtags(topic: string, category?: string): Promise<{ success: boolean; hashtags: any[]; from_cache: boolean }> {
    const { data, error } = await supabase.functions.invoke('discover-hashtags', {
      body: { topic, category },
    });
    if (error) throw error;
    return data;
  },

  async getDiscoveredHashtags(): Promise<any[]> {
    const { data, error } = await (supabase as any)
      .from('trending_hashtags')
      .select('*')
      .eq('is_global', true)
      .order('popularity_score', { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  },

  // Quality score: engagement ratio (likes+shares+comments) / views
  getQualityScore(video: TikTokVideo): number {
    if (!video.views || video.views === 0) return 0;
    const engagement = (video.likes || 0) + (video.shares || 0) * 2 + (video.comments || 0) * 1.5;
    const ratio = engagement / video.views;
    return Math.min(100, Math.round(ratio * 1000));
  },

  // Viralization score: high views with recent creation
  getViralScore(video: TikTokVideo): 'trending' | 'hot' | 'normal' {
    const views = video.views || 0;
    const likes = video.likes || 0;
    const shares = video.shares || 0;
    const engagementRate = views > 0 ? (likes + shares) / views : 0;
    
    if (views >= 500000 && engagementRate > 0.05) return 'trending';
    if (views >= 100000 || (views >= 50000 && engagementRate > 0.08)) return 'hot';
    return 'normal';
  },

  formatNumber,
};
