import { supabase } from '@/integrations/supabase/client';

export const activityTracker = {
  async logSearch(hashtag: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('editor_activity').insert({
        user_id: user.id,
        action_type: 'search',
        details: { hashtag },
      } as any);
    } catch {}
  },

  async logDownload(videoTitle: string, videoId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('editor_activity').insert({
        user_id: user.id,
        action_type: 'download',
        details: { video_title: videoTitle, video_id: videoId },
      } as any);
    } catch {}
  },

  async logBatchDownload(count: number) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('editor_activity').insert({
        user_id: user.id,
        action_type: 'batch_download',
        details: { count },
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
