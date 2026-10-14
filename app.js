import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const reply = (status: number, data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), { status, headers });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) return reply(500, { error: 'Sunucu yapılandırması eksik.' });

    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply(401, { error: 'Giriş gerekli.' });
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await userClient.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return reply(401, { error: 'Oturum doğrulanamadı.' });

    const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: manager, error: managerError } = await service.from('profiles')
      .select('role,active').eq('id', auth.user.id).single();
    if (managerError || !manager?.active || manager.role !== 'admin')
      return reply(403, { error: 'Yalnızca aktif yöneticiler davet gönderebilir.' });

    const payload = await req.json();
    const email = String(payload?.email || '').trim().toLowerCase();
    const role = String(payload?.role || 'viewer');
    if (!/^[^\s@]+@cukurovabombe\.com$/.test(email))
      return reply(400, { error: 'Yalnızca şirket e-postası kullanılabilir.' });
    if (!['admin','editor','viewer'].includes(role))
      return reply(400, { error: 'Geçersiz rol.' });

    const { data: invitation, error: inviteError } = await service.auth.admin.inviteUserByEmail(email);
    if (inviteError) return reply(400, { error: inviteError.message });
    if (!invitation.user) return reply(500, { error: 'Kullanıcı oluşturulamadı.' });
    // Trigger profili oluşturur; yetkiyi servis hesabı ile güncelleriz.
    const { error: roleError } = await service.from('profiles').upsert({
      id: invitation.user.id, email, role, active: true,
    }, { onConflict: 'id' });
    if (roleError) return reply(500, { error: 'Davet gönderildi ancak rol atanamadı. Yönetici panelinden kontrol edin.' });
    return reply(200, { ok: true });
  } catch (_error) {
    return reply(500, { error: 'Beklenmeyen sunucu hatası.' });
  }
});
