import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData.user) return new Response(JSON.stringify({error:"Non authentifié"}), {status:401,headers:{...cors,"Content-Type":"application/json"}});
    const adminDb = createClient(url, service);
    const {data: profile} = await adminDb.from("profiles").select("role").eq("id",userData.user.id).single();
    if (profile?.role !== "admin") return new Response(JSON.stringify({error:"Réservé aux administrateurs"}), {status:403,headers:{...cors,"Content-Type":"application/json"}});
    const {email,role} = await req.json();
    if (!email || !["admin","collaborator"].includes(role)) return new Response(JSON.stringify({error:"E-mail ou rôle invalide"}), {status:400,headers:{...cors,"Content-Type":"application/json"}});
    const {count,error:countErr} = await adminDb.from("profiles").select("id",{count:"exact",head:true});
    if (countErr) throw countErr;
    if ((count ?? 0) >= 22) return new Response(JSON.stringify({error:"La limite prévue de 22 comptes est atteinte."}), {status:400,headers:{...cors,"Content-Type":"application/json"}});
    const {data,error} = await adminDb.auth.admin.inviteUserByEmail(email,{data:{requested_role:role}});
    if(error) throw error;
    if(data.user) await adminDb.from("profiles").update({role}).eq("id",data.user.id);
    return new Response(JSON.stringify({ok:true}),{headers:{...cors,"Content-Type":"application/json"}});
  } catch(e) {
    return new Response(JSON.stringify({error:e.message || "Erreur serveur"}),{status:500,headers:{...cors,"Content-Type":"application/json"}});
  }
});
