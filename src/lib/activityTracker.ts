import { supabase } from '@/integrations/supabase/client';

export const activityTracker = {
  async logSearch(hashtag: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('editor_activity').insert({
      user_id: user.id,
      action_type: 'search',
      details: { hashtag },
    } as any);
  },

  async logDownload(videoTitle: string, videoId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('editor_activity').insert({
      user_id: user.id,
      action_type: 'download',
      details: { video_title: videoTitle, video_id: videoId },
    } as any);
  },

  async logBatchDownload(count: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('editor_activity').insert({
      user_id: user.id,
      action_type: 'batch_download',
      details: { count },
    } as any);
  },

  async logFilter(filters: Record<string, number>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('editor_activity').insert({
      user_id: user.id,
      action_type: 'filter',
      details: filters,
    } as any);
  },

  async logMerge(hashtags: string[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('editor_activity').insert({
      user_id: user.id,
      action_type: 'merge',
      details: { hashtags },
    } as any);
  },
};
