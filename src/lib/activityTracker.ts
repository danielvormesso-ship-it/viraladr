import { supabase } from '@/integrations/supabase/client';

export const activityTracker = {
  async logSearch(hashtag: string, count?: number) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('editor_activity').insert({
        user_id: user.id,
        action_type: 'search',
        details: { hashtag, ...(count != null && { count }) },
      } as any);
    } catch {}
  },

  async logDownload(videoTitle: string, videoId: string, hashtag?: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('editor_activity').insert({
        user_id: user.id,
        action_type: 'download',
        details: { title: (videoTitle || '').slice(0, 50), video_id: videoId, ...(hashtag && { hashtag }) },
      } as any);
    } catch {}
  },

  async logBatchDownload(count: number, hashtag?: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('editor_activity').insert({
        user_id: user.id,
        action_type: 'batch_download',
        details: { count, ...(hashtag && { hashtag }) },
      } as any);
    } catch {}
  },

  async logEditBatch(count: number, tag?: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('editor_activity').insert({
        user_id: user.id,
        action_type: 'edit_batch',
        details: { count, ...(tag && { hashtag: tag }) },
      } as any);
    } catch {}
  },

  async logFilter(filters: Record<string, number>) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('editor_activity').insert({
        user_id: user.id,
        action_type: 'filter',
        details: filters,
      } as any);
    } catch {}
  },

  async logMerge(hashtags: string[]) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('editor_activity').insert({
        user_id: user.id,
        action_type: 'merge',
        details: { hashtags },
      } as any);
    } catch {}
  },
};
