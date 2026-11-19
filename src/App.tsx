import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { weddingApi } from './weddingApi'
import { Heart, Users, Search, Armchair, LayoutDashboard, LogOut, Upload, Plus, Trash2, RefreshCw, ShieldCheck, UserRound, FileUp, Download } from 'lucide-react'

type Profile = { id: string; email: string; display_name: string | null; role: 'admin' | 'collaborator' }
type Guest = {
  id: string; first_name: string; last_name: string; envelope_name: string | null; side: string;
  rsvp: string | null; present: boolean; registered: boolean; family_name: string | null;
  table_id: string | null; seat_label: string | null; message: string | null; email: string | null; phone: string | null;
}
type TableRow = { id: string; table_number: number; table_name: string | null; capacity: number; notes: string | null }
const sideOptions = ['Jonathan','Église','Sephora','À classer']
const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const displayName = (g: Guest) => `${g.first_name || ''} ${g.last_name || ''}`.trim() || g.envelope_name || 'Invité sans nom'

export default function App() {
  const [pin,setPin] = useState('')
  const [pinError,setPinError] = useState('')
  const [session,setSession] = useState<any>(null)
  const [profile,setProfile] = useState<Profile|null>(null)
  const [page,setPage] = useState('dashboard')
  const [guests,setGuests] = useState<Guest[]>([])
  const [tables,setTables] = useState<TableRow[]>([])
  const [planUrl,setPlanUrl] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [query,setQuery] = useState('')
  const [filter,setFilter] = useState('Tous')
  const [familyEdit,setFamilyEdit] = useState<Record<string,string>>({})
  const [newTable,setNewTable] = useState({table_number:'',capacity:'10',table_name:''})
  const [inviteEmail,setInviteEmail] = useState('')
  const [inviteRole,setInviteRole] = useState<'admin'|'collaborator'>('collaborator')
  const [csvBusy,setCsvBusy] = useState(false)

  async function api(action:string,params:Record<string,unknown>={}) {
    const data=await weddingApi(pin,action,params)
    if(data.error)throw new Error(data.error)
    return data
  }
  async function loadAll() {
    setLoading(true);setError('')
    try {const data=await api('load');setGuests(data.guests||[]);setTables(data.tables||[]);setPlanUrl(data.planUrl||'')}
    catch(e){setError(String(e))}
    finally{setLoading(false)}
  }
  async function enterPin(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setPinError('')
    try{const data=await weddingApi(pin,'load');if(data.error)throw new Error(data.error);setGuests(data.guests||[]);setTables(data.tables||[]);setPlanUrl(data.planUrl||'');setProfile({id:'pin',email:'',display_name:'Administrateur',role:'admin'});setSession({user:{id:'pin',email:''}});}
    catch(e){setPinError('Code incorrect ou connexion indisponible.')}
  }
  async function signOut(){setSession(null);setProfile(null);setPin('');setPage('dashboard')}
  const isAdmin = true
  async function updateGuest(id:string,patch:Partial<Guest>){try{await api('updateGuest',{id,patch});setGuests(old=>old.map(g=>g.id===id?{...g,...patch}:g));setNotice('Modification enregistrée.')}catch(e){setError(String(e))}}
  async function addGuest(){const first=prompt('Prénom de l’invité');if(first===null)return;const last=prompt('Nom de famille')||'';if(!first.trim())return;try{const r=await api('addGuest',{guest:{first_name:first.trim(),last_name:last.trim(),side:'À classer'}});setGuests(old=>[...old,r.data])}catch(e){setError(String(e))}}
  async function deleteGuest(g:Guest){if(!confirm(`Supprimer ${displayName(g)} ?`))return;try{await api('deleteGuest',{id:g.id});setGuests(old=>old.filter(x=>x.id!==g.id))}catch(e){setError(String(e))}}
  async function importCSV(file:File){
    setCsvBusy(true);setError('');setNotice('')
    Papa.parse<Record<string,string>>(file,{header:true,skipEmptyLines:true,complete:async result=>{
      const headers=result.meta.fields||[]
      const find=(terms:string[])=>headers.find(h=>terms.every(t=>norm(h).includes(norm(t))))
      const firstCol=find(['first','name'])||find(['prenom'])
      const lastCol=find(['last','name'])||find(['nom'])
      const sideCol=find(['cote'])||find(['side'])
      const rsvpCol=find(['rsvp'])
      const msgCol=find(['message'])||find(['laissez','mot'])
      const envCol=find(['envelope'])
      const emailCol=find(['email'])
      const phoneCol=find(['phone'])
      const map=new Map<string,any>()
      for(const row of result.data){
        const first=(row[firstCol||'']||'').trim(),last=(row[lastCol||'']||'').trim()
        const envelope=(row[envCol||'']||'').trim()
        if(!first&&!last&&!envelope)continue
        const key=norm((`${first} ${last}`).trim()||envelope);if(!key)continue
        const rawSide=(row[sideCol||'']||'').toLowerCase()
        const side=rawSide.includes('jonathan')?'Jonathan':rawSide.includes('eglise')||rawSide.includes('église')?'Église':rawSide.includes('sephora')?'Sephora':'À classer'
        const rsvp=(row[rsvpCol||'']||'').trim(),msg=(row[msgCol||'']||'').trim()
        const present=/oui|yes|accept|present/i.test(rsvp)&&!/non|no|declin/i.test(rsvp)
        if(!map.has(key))map.set(key,{first_name:first,last_name:last,envelope_name:envelope||null,side,rsvp:rsvp||null,present,registered:true,message:msg||null,email:(row[emailCol||'']||'').trim()||null,phone:(row[phoneCol||'']||'').trim()||null})
      }
      try{await api('importGuests',{rows:[...map.values()]});setNotice(`${map.size} invités importés.`);await loadAll()}catch(e){setError(String(e))}
      setCsvBusy(false)
    },error:err=>{setError(err.message);setCsvBusy(false)}})
  }
  async function createTable(){const n=Number(newTable.table_number),cap=Number(newTable.capacity);if(!n||!cap)return;try{const r=await api('createTable',{table:{table_number:n,capacity:cap,table_name:newTable.table_name||null}});setTables(old=>[...old,r.data].sort((a,b)=>a.table_number-b.table_number));setNewTable({table_number:'',capacity:'10',table_name:''})}catch(e){setError(String(e))}}
  async function uploadPlan(file:File){
    try{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const r=await api('uploadPlan',{base64:btoa(binary),name:file.name,mime:file.type});setPlanUrl(r.planUrl||'');setNotice('Plan importé.')}catch(e){setError(String(e))}
  }
  async function invite(){setError('Les invitations par e-mail ne sont pas utilisées avec le code partagé.')}

  const visibleGuests = useMemo(()=>guests.filter(g=>{
    const q=norm(query), matches=!q||norm(displayName(g)).includes(q)||norm(g.family_name||'').includes(q)
    return matches&&(filter==='Tous'||g.side===filter)
  }),[guests,query,filter])
  const families = useMemo(()=>{
    const map=new Map<string,Guest[]>()
    guests.forEach(g=>{const k=(g.family_name||g.last_name||'Sans nom').trim()||'Sans nom';map.set(k,[...(map.get(k)||[]),g])})
    return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0],'fr'))
  },[guests])
  const countPresent=guests.filter(g=>g.present).length
  const assigned=guests.filter(g=>g.table_id).length

  if(!session) return <div className="welcome"><div className="welcome-card"><div className="flourish">✧</div><Heart className="heart"/><p className="eyebrow">NOTRE MARIAGE</p><h1>Sephora <span>&</span> Jonathan</h1><p className="welcome-sub">Un jour, une histoire, une vie à deux</p><div className="welcome-divider">✦</div><h2>Tapez votre code à 4 chiffres</h2><form onSubmit={enterPin}><input aria-label="Code à 4 chiffres" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} placeholder="••••" value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,'').slice(0,4));setPinError('')}} required/><button className="primary" disabled={pin.length!==4}>Valider</button></form>{pinError&&<p className="error">{pinError}</p>}<small>Sephora & Jonathan</small></div></div>

  return <div className="app">
    <aside className="sidebar"><div className="brand"><Heart/><div><b>Sephora & Jonathan</b><small>Espace mariage</small></div></div>
      <nav><button className={page==='dashboard'?'selected':''} onClick={()=>setPage('dashboard')}><LayoutDashboard/>Tableau de bord</button><button className={page==='guests'?'selected':''} onClick={()=>setPage('guests')}><Users/>Invités</button><button className={page==='families'?'selected':''} onClick={()=>setPage('families')}><UserRound/>Familles</button><button className={page==='seating'?'selected':''} onClick={()=>setPage('seating')}><Armchair/>Plan de table</button>{isAdmin&&<button className={page==='admin'?'selected':''} onClick={()=>setPage('admin')}><ShieldCheck/>Administration</button>}</nav>
      <div className="side-bottom"><span className="role">{isAdmin?'Administrateur':'Collaborateur'}</span><small>{session.user.email}</small><button onClick={signOut}><LogOut/>Déconnexion</button></div>
    </aside>
    <main className="content"><header className="topbar"><div><p className="eyebrow">ESPACE PRIVÉ</p><h1>{({dashboard:'Tableau de bord',guests:'Liste des invités',families:'Familles',seating:'Plan de table',admin:'Administration'} as any)[page]}</h1></div><button className="icon-button" onClick={loadAll} title="Actualiser"><RefreshCw/></button></header>
      {error&&<div className="alert">{error}<button onClick={()=>setError('')}>×</button></div>}{notice&&<div className="notice">{notice}<button onClick={()=>setNotice('')}>×</button></div>}{loading&&<p>Chargement…</p>}
      {page==='dashboard'&&<><div className="welcome-banner"><p>BIENVENUE</p><h2>Préparons cette belle journée ensemble.</h2><span>Les informations sont partagées avec les personnes autorisées.</span></div><div className="stats"><Stat icon={<Users/>} value={guests.length} label="Invités"/><Stat icon={<Heart/>} value={countPresent} label="Présences confirmées"/><Stat icon={<Armchair/>} value={assigned} label="Places attribuées"/><Stat icon={<UserRound/>} value={families.length} label="Familles suggérées"/></div><div className="panel"><h3>Répartition des invités</h3><div className="distribution">{sideOptions.map(s=><div key={s}><span>{s}</span><b>{guests.filter(g=>g.side===s).length}</b><i><em style={{width:`${guests.length?guests.filter(g=>g.side===s).length/guests.length*100:0}%`}}/></i></div>)}</div></div></>}
      {page==='guests'&&<section className="panel"><div className="panel-head"><div><h2>Les invités</h2><p>{visibleGuests.length} résultat(s)</p></div><div className="actions"><label className="button secondary"><FileUp/>Importer CSV<input type="file" accept=".csv,text/csv" hidden onChange={e=>e.target.files?.[0]&&importCSV(e.target.files[0])}/></label><button className="primary" onClick={addGuest}><Plus/>Ajouter</button></div></div><div className="filters"><div className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un nom, une famille…"/></div>{['Tous',...sideOptions].map(s=><button className={filter===s?'chip active':'chip'} onClick={()=>setFilter(s)} key={s}>{s}</button>)}</div>{csvBusy&&<p>Import en cours…</p>}<div className="table-scroll"><table><thead><tr><th>Invité</th><th>Côté</th><th>Famille</th><th>Présent</th><th>Inscrit</th><th>Table</th><th>Siège</th><th></th></tr></thead><tbody>{visibleGuests.map(g=><tr key={g.id}><td><b>{displayName(g)}</b><small>{g.email||g.envelope_name||''}</small></td><td><select value={g.side} onChange={e=>updateGuest(g.id,{side:e.target.value})}>{sideOptions.map(s=><option key={s}>{s}</option>)}</select></td><td><input className="cell-input" value={familyEdit[g.id]??g.family_name??g.last_name??''} onChange={e=>setFamilyEdit(o=>({...o,[g.id]:e.target.value}))} onBlur={e=>{const v=e.target.value.trim()||null;if(v!==g.family_name)updateGuest(g.id,{family_name:v});setFamilyEdit(o=>{const n={...o};delete n[g.id];return n})}}/></td><td><input type="checkbox" checked={g.present} onChange={e=>updateGuest(g.id,{present:e.target.checked})}/></td><td><input type="checkbox" checked={g.registered} onChange={e=>updateGuest(g.id,{registered:e.target.checked})}/></td><td>{isAdmin?<select value={g.table_id||''} onChange={e=>updateGuest(g.id,{table_id:e.target.value||null})}><option value="">—</option>{tables.map(t=><option value={t.id} key={t.id}>Table {t.table_number}</option>)}</select>:tables.find(t=>t.id===g.table_id)?.table_number||'—'}</td><td>{isAdmin?<input className="seat-input" value={g.seat_label||''} onChange={e=>updateGuest(g.id,{seat_label:e.target.value||null})}/>:g.seat_label||'—'}</td><td><button className="delete" onClick={()=>deleteGuest(g)} title="Supprimer"><Trash2/></button></td></tr>)}</tbody></table></div><p className="hint">Les collaborateurs peuvent modifier les fiches invités. Les changements sont enregistrés en ligne.</p></section>}
      {page==='families'&&<section className="panel"><h2>Familles</h2><p className="muted">Suggestions automatiques à partir des noms de famille. Tu peux corriger le nom de famille depuis la liste des invités.</p><div className="family-grid">{families.map(([name,people])=><article className="family-card" key={name}><div className="family-title"><Users/><b>{name}</b><span>{people.length}</span></div>{people.map(g=><div className="family-person" key={g.id}>{displayName(g)}<small>{g.side}</small></div>)}</article>)}</div></section>}
      {page==='seating'&&<section className="panel"><div className="panel-head"><div><h2>Plan de table</h2><p>{isAdmin?'Gestion réservée aux administrateurs':'Consultation uniquement'}</p></div>{isAdmin&&<label className="button primary"><Upload/>Importer le plan<input hidden type="file" accept="image/*,.pdf,application/pdf" onChange={e=>e.target.files?.[0]&&uploadPlan(e.target.files[0])}/></label>}</div>{planUrl?<a href={planUrl} target="_blank" rel="noreferrer">Ouvrir le plan importé</a>:<div className="empty">Le plan de table n’a pas encore été importé.</div>}{isAdmin&&<div className="table-creator"><h3>Créer une table</h3><input placeholder="N° de table" type="number" value={newTable.table_number} onChange={e=>setNewTable({...newTable,table_number:e.target.value})}/><input placeholder="Nom (facultatif)" value={newTable.table_name} onChange={e=>setNewTable({...newTable,table_name:e.target.value})}/><input placeholder="Capacité" type="number" value={newTable.capacity} onChange={e=>setNewTable({...newTable,capacity:e.target.value})}/><button className="primary" onClick={createTable}>Créer</button></div>}<div className="table-cards">{tables.map(t=><article className="table-card" key={t.id}><b>Table {t.table_number}{t.table_name?` — ${t.table_name}`:''}</b><span>{guests.filter(g=>g.table_id===t.id).length} / {t.capacity} places</span><small>{guests.filter(g=>g.table_id===t.id).map(displayName).join(' · ')||'Aucun invité affecté'}</small></article>)}</div></section>}
      {page==='admin'&&isAdmin&&<section className="panel"><h2>Administration</h2><p className="muted">Inviter un collaborateur ou un autre administrateur. Maximum conseillé : 22 comptes au total.</p><div className="invite-form"><input type="email" placeholder="Adresse e-mail" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/><select value={inviteRole} onChange={e=>setInviteRole(e.target.value as any)}><option value="collaborator">Collaborateur</option><option value="admin">Administrateur</option></select><button className="primary" onClick={invite}>Envoyer une invitation</button></div><div className="security-note"><ShieldCheck/><div><b>Accès sécurisé</b><p>Les droits sont appliqués par la base de données. Les collaborateurs ne peuvent pas modifier les tables, les sièges ni le document du plan de table.</p></div></div><button className="secondary" onClick={()=>{const blob=new Blob([JSON.stringify({guests,tables,exported_at:new Date().toISOString()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sauvegarde-sephora-jonathan.json';a.click();URL.revokeObjectURL(a.href)}}><Download/>Exporter une sauvegarde</button></section>}
      <footer>Sephora & Jonathan · Espace privé et collaboratif</footer>
    </main>
  </div>
}
function Stat({icon,value,label}:{icon:React.ReactNode,value:number,label:string}){return <div className="stat"><span className="stat-icon">{icon}</span><b>{value}</b><small>{label}</small></div>}
