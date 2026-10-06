import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import './style.css';

const url=import.meta.env.VITE_SUPABASE_URL, key=import.meta.env.VITE_SUPABASE_ANON_KEY;
const sb=url&&key?createClient(url,key):null;

const statuses=['NEW','DIAGNOSING','WAITING FOR APPROVAL','WAITING FOR PARTS','REPAIRING','READY FOR PICKUP','COMPLETED'];

const blankCustomer={name:'',phone:'',address:'',notes:''};
const blankEquipment={customer_id:'',equipment_type:'',manufacturer:'',model:'',serial_number:'',engine:'',engine_model:'',notes:''};
const blankTicket={customer_id:'',equipment_id:'',customer_issue:'',diagnosis:'',additional_work:'',estimate:'',approval_status:'PENDING',parts_needed:'',work_performed:'',technician_notes:'',status:'NEW'};

const money=n=>n==null||n===''?'—':Number(n).toLocaleString('en-US',{style:'currency',currency:'USD'});

function App(){
 const [session,setSession]=useState(null),[tab,setTab]=useState('Dashboard'),[customers,setCustomers]=useState([]),[equipment,setEquipment]=useState([]),[tickets,setTickets]=useState([]),[loading,setLoading]=useState(true),[q,setQ]=useState(''),[modal,setModal]=useState(null),[form,setForm]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState('');

 useEffect(()=>{
  if(!sb){setLoading(false);return}
  sb.auth.getSession().then(({data})=>setSession(data.session));
  const {data}=sb.auth.onAuthStateChange((_e,s)=>setSession(s));
  return()=>data.subscription.unsubscribe()
 },[]);

 useEffect(()=>{if(session)load()},[session]);

 async function load(){
  setLoading(true);
  setError('');
  const [c,e,t]=await Promise.all([
   sb.from('customers').select('*').order('name'),
   sb.from('equipment').select('*').order('created_at',{ascending:false}),
   sb.from('tickets').select('*').order('created_at',{ascending:false})
  ]);
  const err=c.error||e.error||t.error;
  if(err)setError(err.message);
  setCustomers(c.data||[]);
  setEquipment(e.data||[]);
  setTickets(t.data||[]);
  setLoading(false)
 }

 async function save(table,data){
  setError('');
  const clean={...data};
  if(table==='tickets'&&clean.estimate==='')clean.estimate=null;
  const r=await sb.from(table).upsert(clean).select().single();
  if(r.error){setError(r.error.message);return}
  setModal(null);
  setNotice('Saved successfully');
  setTimeout(()=>setNotice(''),2200);
  await load()
 }

 async function remove(table,id){
  if(!confirm('Delete this record?'))return;
  const r=await sb.from(table).delete().eq('id',id);
  if(r.error)setError(r.error.message);
  else load()
 }

 async function login(e){
  e.preventDefault();
  const r=await sb.auth.signInWithPassword({
   email:e.target.email.value,
   password:e.target.password.value
  });
  if(r.error)setError(r.error.message)
 }

 const customerName=id=>customers.find(x=>x.id===id)?.name||'—';
 const equipmentName=id=>{
  const x=equipment.find(y=>y.id===id);
  return x?[x.manufacturer,x.model].filter(Boolean).join(' ')||x.equipment_type||'Equipment':'—'
 };

 const filtered={
  customers:customers.filter(x=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase())),
  equipment:equipment.filter(x=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase())),
  tickets:tickets.filter(x=>JSON.stringify({...x,customer:customerName(x.customer_id),equipment:equipmentName(x.equipment_id)}).toLowerCase().includes(q.toLowerCase()))
 };

 const counts=Object.fromEntries(statuses.map(s=>[s,tickets.filter(t=>t.status===s).length]));

 if(!sb)return <Setup/>;
 if(!session)return <Login error={error} login={login}/>;

 return <div className="app">
  <header>
   <div><h1>Shop Ticket</h1><span>Small-engine repair management</span></div>
   <button className="ghost" onClick={()=>sb.auth.signOut()}>Sign out</button>
  </header>

  <nav>
   {['Dashboard','Customers','Equipment','Tickets'].map(x=>
    <button key={x} className={tab===x?'active':''} onClick={()=>{setTab(x);setQ('')}}>{x}</button>
   )}
  </nav>

  <main>
   {error&&<div className="alert">{error}</div>}
   {notice&&<div className="notice">{notice}</div>}
   {loading?<div className="panel loading">Loading shop data…</div>:<>
    {tab==='Dashboard'&&
     <Dashboard tickets={tickets} counts={counts} customerName={customerName}
      equipmentName={equipmentName}
      openTicket={()=>{setForm({...blankTicket});setModal('ticket')}}
      editTicket={t=>{setForm(t);setModal('ticket')}}
      setTab={setTab} setQ={setQ}/>}
    {tab==='Customers'&&
     <List title="Customers" add={()=>{setForm({...blankCustomer});setModal('customer')}}
      search={q} setSearch={setQ} addText="New Customer">
      <div className="list">
       {filtered.customers.map(c=>
        <CustomerRow key={c.id} c={c} equipment={equipment} tickets={tickets}
         edit={()=>{setForm(c);setModal('customer')}}
         view={()=>setModal({type:'customerDetail',data:c})}
         remove={()=>remove('customers',c.id)}/>
       )}
      </div>
     </List>}
    {tab==='Equipment'&&
     <List title="Equipment" add={()=>{setForm({...blankEquipment});setModal('equipment')}}
      search={q} setSearch={setQ} addText="New Equipment">
      <div className="list">
       {filtered.equipment.map(x=>
        <EquipmentRow key={x.id} x={x} customerName={customerName}
         edit={()=>{setForm(x);setModal('equipment')}}
         remove={()=>remove('equipment',x.id)}/>
       )}
      </div>
     </List>}
    {tab==='Tickets'&&
     <List title="Tickets" add={()=>{setForm({...blankTicket});setModal('ticket')}}
      search={q} setSearch={setQ} addText="New Ticket">
      <div className="list">
       {filtered.tickets.map(t=>
        <TicketRow key={t.id} t={t} customerName={customerName}
         equipmentName={equipmentName}
         onEdit={()=>{setForm(t);setModal('ticket')}}
         onDelete={()=>remove('tickets',t.id)}/>
       )}
      </div>
     </List>}
   </>}
  </main>

  {modal&&
   <Modal title={modal==='customer'?'Customer':modal==='equipment'?'Equipment':modal==='ticket'?'Repair Ticket':'Customer History'}
    close={()=>setModal(null)}>
    {modal==='customer'?
     <CustomerForm form={form} setForm={setForm} save={save}/>:
     modal==='equipment'?
     <EquipmentForm form={form} setForm={setForm} save={save} customers={customers}/>:
     modal==='ticket'?
     <TicketForm form={form} setForm={setForm} save={save} customers={customers} equipment={equipment}/>:
     <CustomerDetail customer={modal.data} equipment={equipment} tickets={tickets}
      equipmentName={equipmentName}
      editTicket={t=>{setForm(t);setModal('ticket')}}/>
    }
   </Modal>}
 </div>
}

function Setup(){
 return <div className="login"><div className="card">
  <h1>Shop Ticket V2</h1>
  <p>Connect the app to Supabase to enable shared cloud data.</p>
  <code>Add your Supabase URL and anon key in Vercel.</code>
 </div></div>
}

function Login({error,login}){
 return <div className="login"><div className="card">
  <div className="brandmark">ST</div>
  <h1>Shop Ticket</h1>
  <p>Sign in to your shop.</p>
  <form onSubmit={login}>
   <input name="email" type="email" placeholder="Email" autoComplete="email" required/>
   <input name="password" type="password" placeholder="Password" autoComplete="current-password" required/>
   <button>Sign In</button>
  </form>
  {error&&<p className="error">{error}</p>}
 </div></div>
}

function Dashboard({tickets,counts,customerName,equipmentName,openTicket,editTicket,setTab,setQ}){
 return <>
  <div className="top">
   <div><h2>Dashboard</h2><p className="muted">Your shop at a glance</p></div>
   <button onClick={openTicket}>＋ New Ticket</button>
  </div>
  <div className="stats">
   {statuses.map(s=><button key={s} onClick={()=>{setTab('Tickets');setQ(s)}}><b>{counts[s]}</b><span>{s}</span></button>)}
  </div>
  <section className="panel">
   <div className="sectionhead"><h3>Recent tickets</h3><button className="small" onClick={()=>setTab('Tickets')}>View all</button></div>
   {tickets.length?tickets.slice(0,8).map(t=>
    <TicketRow key={t.id} t={t} customerName={customerName} equipmentName={equipmentName} onEdit={()=>editTicket(t)}/>
   ):<Empty text="No tickets yet. Create your first repair ticket."/>}
  </section>
 </>
}

function List({title,add,search,setSearch,addText,children}){
 return <>
  <div className="top"><div><h2>{title}</h2></div><button onClick={add}>＋ {addText}</button></div>
  <input className="search" placeholder={'Search '+title.toLowerCase()+'…'} value={search} onChange={e=>setSearch(e.target.value)}/>
  <section className="panel">{children}</section>
 </>
}

function CustomerRow({c,equipment,tickets,edit,view,remove}){
 const ec=equipment.filter(x=>x.customer_id===c.id).length;
 const tc=tickets.filter(x=>x.customer_id===c.id).length;
 return <div className="row">
  <div><b>{c.name}</b><small>{c.phone||'No phone'} · {c.address||'No address'}</small>
   <div className="chips"><span>{ec} equipment</span><span>{tc} tickets</span></div>
  </div>
  <div className="rowactions">
   <button className="small" onClick={view}>History</button>
   <button className="small" onClick={edit}>Edit</button>
   <button className="small danger" onClick={remove}>Delete</button>
  </div>
 </div>
}

function EquipmentRow({x,customerName,edit,remove}){
 return <div className="row">
  <div>
   <b>{[x.manufacturer,x.model].filter(Boolean).join(' ')||x.equipment_type||'Equipment'}</b>
   <small>{customerName(x.customer_id)} · S/N {x.serial_number||'—'} · {x.engine_model||x.engine||'Engine not entered'}</small>
  </div>
  <div className="rowactions">
   <button className="small" onClick={edit}>Edit</button>
   <button className="small danger" onClick={remove}>Delete</button>
  </div>
 </div>
}

function TicketRow({t,customerName,equipmentName,onEdit,onDelete}){
 return <div className="row ticket">
  <div>
   <b>Ticket #{t.ticket_number||'New'}</b>
   <small>{customerName(t.customer_id)} · {equipmentName(t.equipment_id)}</small>
   <small>{t.customer_issue||'No issue entered'} {t.estimate!=null?' · '+money(t.estimate):''}</small>
  </div>
  <span className="badge">{t.status}</span>
  <div className="rowactions">
   <button className="small" onClick={onEdit}>Edit</button>
   {onDelete&&<button className="small danger" onClick={onDelete}>Delete</button>}
  </div>
 </div>
}

function CustomerDetail({customer,equipment,tickets,equipmentName,editTicket}){
 const eq=equipment.filter(x=>x.customer_id===customer.id);
 const ts=tickets.filter(x=>x.customer_id===customer.id);
 return <div>
  <div className="detailhero">
   <h3>{customer.name}</h3>
   <p>{customer.phone||'No phone'} · {customer.address||'No address'}</p>
   {customer.notes&&<p>{customer.notes}</p>}
  </div>
  <h3>Equipment</h3>
  {eq.length?eq.map(x=><div className="historyitem" key={x.id}><b>{equipmentName(x.id)}</b><span>S/N {x.serial_number||'—'}</span></div>):<Empty text="No equipment recorded."/>}
  <h3 className="mt">Repair history</h3>
  {ts.length?ts.map(t=><div className="historyitem" key={t.id} onClick={()=>editTicket(t)}>
   <div><b>Ticket #{t.ticket_number||'New'}</b><span>{t.customer_issue||'No issue entered'}</span></div>
   <span className="badge">{t.status}</span>
  </div>):<Empty text="No repair history yet."/>}
 </div>
}

function Empty({text}){return <div className="empty">{text}</div>}

function Modal({title,close,children}){
 return <div className="overlay"><div className="modal">
  <div className="modalhead"><h2>{title}</h2><button className="ghost dark" onClick={close}>✕</button></div>
  {children}
 </div></div>
}

function CustomerForm({form,setForm,save}){
 return <Form>
  <Field l="Name" k="name" f={form} s={setForm} req/>
  <Field l="Phone" k="phone" f={form} s={setForm} type="tel"/>
  <Field l="Address" k="address" f={form} s={setForm}/>
  <Field l="Customer notes" k="notes" f={form} s={setForm} area/>
  <Actions save={()=>save('customers',form)}/>
 </Form>
}

function EquipmentForm({form,setForm,save,customers}){
 return <Form>
  <Select l="Customer" k="customer_id" f={form} s={setForm} opts={customers.map(x=>[x.id,x.name])} req/>
  <Field l="Equipment type" k="equipment_type" f={form} s={setForm} placeholder="Mower, chainsaw, generator…"/>
  <Field l="Manufacturer" k="manufacturer" f={form} s={setForm}/>
  <Field l="Model" k="model" f={form} s={setForm}/>
  <Field l="Serial number" k="serial_number" f={form} s={setForm}/>
  <Field l="Engine" k="engine" f={form} s={setForm}/>
  <Field l="Engine model / number" k="engine_model" f={form} s={setForm}/>
  <Field l="Equipment notes" k="notes" f={form} s={setForm} area/>
  <Actions save={()=>save('equipment',form)}/>
 </Form>
}

function TicketForm({form,setForm,save,customers,equipment}){
 const eq=equipment.filter(x=>x.customer_id===form.customer_id);
 return <Form>
  <div className="ticketnumber">Ticket #{form.ticket_number||'New ticket'}</div>
  <Select l="Customer" k="customer_id" f={form} s={v=>setForm({...v,equipment_id:''})} opts={customers.map(x=>[x.id,x.name])} req/>
  <Select l="Equipment" k="equipment_id" f={form} s={setForm} opts={eq.map(x=>[x.id,[x.manufacturer,x.model].filter(Boolean).join(' ')||x.equipment_type||'Equipment'])}/>
  <Field l="Customer-reported issue" k="customer_issue" f={form} s={setForm} area/>
  <Field l="Diagnosis" k="diagnosis" f={form} s={setForm} area/>
  <Field l="Additional work requested" k="additional_work" f={form} s={setForm} area/>
  <div className="two">
   <Field l="Estimate" k="estimate" f={form} s={setForm} type="number" placeholder="0.00"/>
   <Select l="Approval" k="approval_status" f={form} s={setForm} opts={['PENDING','APPROVED','DECLINED','NOT_REQUIRED'].map(x=>[x,x])}/>
  </div>
  <Select l="Status" k="status" f={form} s={setForm} opts={statuses.map(x=>[x,x])}/>
  <Field l="Parts needed" k="parts_needed" f={form} s={setForm} area/>
  <Field l="Work performed" k="work_performed" f={form} s={setForm} area/>
  <Field l="Technician notes" k="technician_notes" f={form} s={setForm} area/>
  <Actions save={()=>save('tickets',form)}/>
 </Form>
}

function Form({children}){return <div className="form">{children}</div>}

function Field({l,k,f,s,area,type='text',placeholder,req}){
 return <label>{l}
  {area?
   <textarea value={f[k]||''} placeholder={placeholder} onChange={e=>s({...f,[k]:e.target.value})}/>:
   <input required={req} type={type} value={f[k]??''} placeholder={placeholder} onChange={e=>s({...f,[k]:e.target.value})}/>
  }
 </label>
}

function Select({l,k,f,s,opts,req}){
 return <label>{l}
  <select required={req} value={f[k]||''} onChange={e=>s({...f,[k]:e.target.value})}>
   <option value="">Select…</option>
   {opts.map(([v,t])=><option key={v} value={v}>{t}</option>)}
  </select>
 </label>
}

function Actions({save}){
 return <div className="actions"><button onClick={save}>Save</button></div>
}

createRoot(document.getElementById('root')).render(<App/>);
