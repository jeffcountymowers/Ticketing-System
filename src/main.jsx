import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import './style.css';

const sb=createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const statuses=[
 'NEW','DIAGNOSING','WAITING FOR APPROVAL','WAITING FOR PARTS',
 'REPAIRING','READY FOR PICKUP','COMPLETED'
];

const approvals=['PENDING','APPROVED','DECLINED','NOT_REQUIRED'];

const blankCustomer={name:'',phone:'',address:'',notes:''};

const blankEquipment={
 customer_id:'',equipment_type:'',manufacturer:'',model:'',
 serial_number:'',engine:'',engine_model:'',notes:''
};

const blankTicket={
 customer_id:'',
 equipment_id:'',
 customer_issue:'',
 diagnosis:'',
 additional_work:'',
 estimate:'',
 approval_status:'PENDING',
 parts_needed:'',
 work_performed:'',
 technician_notes:'',
 status:'NEW',
 tax_rate:0
};

const money=n=>Number(n||0).toLocaleString('en-US',{
 style:'currency',currency:'USD'
});

function App(){
 const [session,setSession]=useState(null);
 const [tab,setTab]=useState('Dashboard');
 const [customers,setCustomers]=useState([]);
 const [equipment,setEquipment]=useState([]);
 const [tickets,setTickets]=useState([]);
 const [loading,setLoading]=useState(true);
 const [q,setQ]=useState('');
 const [modal,setModal]=useState(null);
 const [form,setForm]=useState(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');

 useEffect(()=>{
  sb.auth.getSession().then(({data})=>setSession(data.session));
  const {data}=sb.auth.onAuthStateChange((_e,s)=>setSession(s));
  return()=>data.subscription.unsubscribe();
 },[]);

 useEffect(()=>{if(session)load()},[session]);

 async function load(){
  setLoading(true);
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
  setLoading(false);
 }

 async function save(table,data){
  setError('');
  const clean={...data};

  if(table==='tickets'&&clean.estimate==='') clean.estimate=null;

  const r=await sb.from(table).upsert(clean).select().single();

  if(r.error){
   setError(r.error.message);
   return;
  }

  setModal(null);
  setNotice('Saved successfully');
  setTimeout(()=>setNotice(''),2000);
  await load();
 }

 async function remove(table,id){
  if(!confirm('Delete this record?'))return;

  const r=await sb.from(table).delete().eq('id',id);

  if(r.error)setError(r.error.message);
  else load();
 }

 async function login(e){
  e.preventDefault();

  const r=await sb.auth.signInWithPassword({
   email:e.target.email.value,
   password:e.target.password.value
  });

  if(r.error)setError(r.error.message);
 }

 const customerName=id=>
  customers.find(x=>x.id===id)?.name||'—';

 const equipmentName=id=>{
  const x=equipment.find(y=>y.id===id);

  return x
   ? [x.manufacturer,x.model].filter(Boolean).join(' ')
      ||x.equipment_type||'Equipment'
   :'—';
 };

 const search=x=>
  JSON.stringify(x).toLowerCase().includes(q.toLowerCase());

 const filteredCustomers=customers.filter(search);
 const filteredEquipment=equipment.filter(search);

 const filteredTickets=tickets.filter(t=>search({
  ...t,
  customer:customerName(t.customer_id),
  equipment:equipmentName(t.equipment_id)
 }));

 if(!session)
  return <Login error={error} login={login}/>;

 return <div className="app">

  <header>
   <div>
    <h1>JeffCo</h1>
    <span>Lawn Mower Repair</span>
   </div>

   <button className="ghost" onClick={()=>sb.auth.signOut()}>
    Sign out
   </button>
  </header>

  <nav>
   {['Dashboard','Customers','Equipment','Tickets'].map(x=>
    <button
     key={x}
     className={tab===x?'active':''}
     onClick={()=>{setTab(x);setQ('')}}
    >
     {x}
    </button>
   )}
  </nav>

  <main>

   {error&&<div className="alert">{error}</div>}
   {notice&&<div className="notice">{notice}</div>}

   {loading
    ? <div className="panel">Loading…</div>
    : <>
     
     {tab==='Dashboard'&&<>
      <div className="top">
       <div>
        <h2>Dashboard</h2>
        <p className="muted">JeffCo repair shop</p>
       </div>

       <button onClick={()=>{
        setForm({...blankTicket});
        setModal('ticket');
       }}>
        ＋ New Ticket
       </button>
      </div>

      <div className="stats">
       {statuses.map(s=>
        <button
         key={s}
         onClick={()=>{
          setTab('Tickets');
          setQ(s);
         }}
        >
         <b>{tickets.filter(t=>t.status===s).length}</b>
         <span>{s}</span>
        </button>
       )}
      </div>

      <section className="panel">
       <h3>Recent Tickets</h3>

       {tickets.slice(0,8).map(t=>
        <TicketRow
         key={t.id}
         t={t}
         customerName={customerName}
         equipmentName={equipmentName}
         edit={()=>{
          setForm(t);
          setModal('ticket');
         }}
        />
       )}
      </section>
     </>}

     {tab==='Customers'&&<>
      <PageTop
       title="Customers"
       button="New Customer"
       click={()=>{
        setForm({...blankCustomer});
        setModal('customer');
       }}
      />

      <Search q={q} setQ={setQ}/>

      <section className="panel">
       {filteredCustomers.map(c=>
        <div className="row" key={c.id}>
         <div>
          <b>{c.name}</b>
          <small>{c.phone||'No phone'}</small>
          <small>{c.address||'No address'}</small>
         </div>

         <div className="rowactions">
          <button className="small" onClick={()=>{
           setForm(c);
           setModal('customer');
          }}>
           Edit
          </button>

          <button
           className="small danger"
           onClick={()=>remove('customers',c.id)}
          >
           Delete
          </button>
         </div>
        </div>
       )}
      </section>
     </>}

     {tab==='Equipment'&&<>
      <PageTop
       title="Equipment"
       button="New Equipment"
       click={()=>{
        setForm({...blankEquipment});
        setModal('equipment');
       }}
      />

      <Search q={q} setQ={setQ}/>

      <section className="panel">
       {filteredEquipment.map(x=>
        <div className="row" key={x.id}>
         <div>
          <b>
           {[x.manufacturer,x.model].filter(Boolean).join(' ')
             ||x.equipment_type||'Equipment'}
          </b>

          <small>{customerName(x.customer_id)}</small>
          <small>S/N: {x.serial_number||'—'}</small>
         </div>

         <div className="rowactions">
          <button className="small" onClick={()=>{
           setForm(x);
           setModal('equipment');
          }}>
           Edit
          </button>

          <button
           className="small danger"
           onClick={()=>remove('equipment',x.id)}
          >
           Delete
          </button>
         </div>
        </div>
       )}
      </section>
     </>}

     {tab==='Tickets'&&<>
      <PageTop
       title="Tickets"
       button="New Ticket"
       click={()=>{
        setForm({...blankTicket});
        setModal('ticket');
       }}
      />

      <Search q={q} setQ={setQ}/>

      <section className="panel">
       {filteredTickets.map(t=>
        <TicketRow
         key={t.id}
         t={t}
         customerName={customerName}
         equipmentName={equipmentName}
         edit={()=>{
          setForm(t);
          setModal('ticket');
         }}
         remove={()=>remove('tickets',t.id)}
        />
       )}
      </section>
     </>}

    </>
   }
  </main>

  {modal&&
   <Modal
    title={
     modal==='customer'?'Customer':
     modal==='equipment'?'Equipment':
     'Repair Ticket'
    }
    close={()=>setModal(null)}
   >

    {modal==='customer'&&
     <CustomerForm
      form={form}
      setForm={setForm}
      save={save}
     />
    }

    {modal==='equipment'&&
     <EquipmentForm
      form={form}
      setForm={setForm}
      save={save}
      customers={customers}
     />
    }

    {modal==='ticket'&&
     <TicketForm
      form={form}
      setForm={setForm}
      save={save}
      customers={customers}
      equipment={equipment}
     />
    }

   </Modal>
  }

 </div>;
}

function PageTop({title,button,click}){
 return <div className="top">
  <h2>{title}</h2>
  <button onClick={click}>＋ {button}</button>
 </div>;
}

function Search({q,setQ}){
 return <input
  className="search"
  placeholder="Search…"
  value={q}
  onChange={e=>setQ(e.target.value)}
 />;
}

function Login({error,login}){
 return <div className="login">
  <div className="card">

   <div className="brandmark">J</div>

   <h1>JeffCo</h1>
   <p>Lawn Mower Repair</p>

   <form onSubmit={login}>
    <input
     name="email"
     type="email"
     placeholder="Email"
     required
    />

    <input
     name="password"
     type="password"
     placeholder="Password"
     required
    />

    <button>Sign In</button>
   </form>

   {error&&<p className="error">{error}</p>}

  </div>
 </div>;
}

function TicketRow({
 t,customerName,equipmentName,edit,remove
}){
 return <div className="row ticket">

  <div>
   <b>Ticket #{t.ticket_number}</b>

   <small>
    {customerName(t.customer_id)}
    {' · '}
    {equipmentName(t.equipment_id)}
   </small>

   <small>
    {t.customer_issue||'No issue entered'}
   </small>
  </div>

  <span className="badge">{t.status}</span>

  <div className="rowactions">
   <button className="small" onClick={edit}>
    Open
   </button>

   {remove&&
    <button
     className="small danger"
     onClick={remove}
    >
     Delete
    </button>
   }
  </div>

 </div>;
}

function CustomerForm({form,setForm,save}){
 return <div className="form">

  <Field l="Name" k="name" f={form} s={setForm}/>
  <Field l="Phone" k="phone" f={form} s={setForm}/>
  <Field l="Address" k="address" f={form} s={setForm}/>
  <Field l="Notes" k="notes" f={form} s={setForm} area/>

  <button onClick={()=>save('customers',form)}>
   Save Customer
  </button>

 </div>;
}

function EquipmentForm({
 form,setForm,save,customers
}){
 return <div className="form">

  <Select
   l="Customer"
   k="customer_id"
   f={form}
   s={setForm}
   opts={customers.map(c=>[c.id,c.name])}
  />

  <Field l="Equipment Type" k="equipment_type" f={form} s={setForm}/>
  <Field l="Manufacturer" k="manufacturer" f={form} s={setForm}/>
  <Field l="Model" k="model" f={form} s={setForm}/>
  <Field l="Serial Number" k="serial_number" f={form} s={setForm}/>
  <Field l="Engine" k="engine" f={form} s={setForm}/>
  <Field l="Engine Model" k="engine_model" f={form} s={setForm}/>
  <Field l="Notes" k="notes" f={form} s={setForm} area/>

  <button onClick={()=>save('equipment',form)}>
   Save Equipment
  </button>

 </div>;
}

function TicketForm({
 form,setForm,save,customers,equipment
}){
 const [parts,setParts]=useState([]);
 const [labor,setLabor]=useState([]);
 const [loaded,setLoaded]=useState(false);

 useEffect(()=>{
  if(form.id) loadCharges();
  else setLoaded(true);
 },[form.id]);

 async function loadCharges(){
  const [p,l]=await Promise.all([
   sb.from('ticket_parts')
    .select('*')
    .eq('ticket_id',form.id)
    .order('created_at'),

   sb.from('ticket_labor')
    .select('*')
    .eq('ticket_id',form.id)
    .order('created_at')
  ]);

  setParts(p.data||[]);
  setLabor(l.data||[]);
  setLoaded(true);
 }

 async function addPart(){
  if(!form.id){
   alert('Save the ticket first, then add parts.');
   return;
  }

  const r=await sb.from('ticket_parts').insert({
   ticket_id:form.id,
   part_number:'',
   description:'New Part',
   quantity:1,
   unit_price:0
  }).select().single();

  if(!r.error)setParts([...parts,r.data]);
 }

 async function addLabor(){
  if(!form.id){
   alert('Save the ticket first, then add labor.');
   return;
  }

  const r=await sb.from('ticket_labor').insert({
   ticket_id:form.id,
   description:'Labor',
   hours:1,
   hourly_rate:0
  }).select().single();

  if(!r.error)setLabor([...labor,r.data]);
 }

 async function updatePart(id,changes){
  setParts(parts.map(p=>
   p.id===id?{...p,...changes}:p
  ));

  await sb.from('ticket_parts')
   .update(changes)
   .eq('id',id);
 }

 async function updateLabor(id,changes){
  setLabor(labor.map(l=>
   l.id===id?{...l,...changes}:l
  ));

  await sb.from('ticket_labor')
   .update(changes)
   .eq('id',id);
 }

 async function deletePart(id){
  await sb.from('ticket_parts').delete().eq('id',id);
  setParts(parts.filter(p=>p.id!==id));
 }

 async function deleteLabor(id){
  await sb.from('ticket_labor').delete().eq('id',id);
  setLabor(labor.filter(l=>l.id!==id));
 }

 const partsSubtotal=parts.reduce(
  (sum,p)=>sum+
   Number(p.quantity||0)*Number(p.unit_price||0),0
 );

 const laborSubtotal=labor.reduce(
  (sum,l)=>sum+
   Number(l.hours||0)*Number(l.hourly_rate||0),0
 );

 const subtotal=partsSubtotal+laborSubtotal;

 const tax=subtotal*
  (Number(form.tax_rate||0)/100);

 const total=subtotal+tax;

 const customerEquipment=equipment.filter(
  e=>e.customer_id===form.customer_id
 );

 return <div className="form">

  <div className="ticketnumber">
   Ticket #{form.ticket_number||'New'}
  </div>

  <Select
   l="Customer"
   k="customer_id"
   f={form}
   s={x=>setForm({...x,equipment_id:''})}
   opts={customers.map(c=>[c.id,c.name])}
  />

  <Select
   l="Equipment"
   k="equipment_id"
   f={form}
   s={setForm}
   opts={customerEquipment.map(e=>[
    e.id,
    [e.manufacturer,e.model]
     .filter(Boolean).join(' ')
     ||e.equipment_type
   ])}
  />

  <Field
   l="Customer Reported Issue"
   k="customer_issue"
   f={form}
   s={setForm}
   area
  />

  <Field
   l="Diagnosis"
   k="diagnosis"
   f={form}
   s={setForm}
   area
  />

  <Field
   l="Additional Work"
   k="additional_work"
   f={form}
   s={setForm}
   area
  />

  <Select
   l="Approval Status"
   k="approval_status"
   f={form}
   s={setForm}
   opts={approvals.map(x=>[x,x])}
  />

  <Select
   l="Repair Status"
   k="status"
   f={form}
   s={setForm}
   opts={statuses.map(x=>[x,x])}
  />

  <hr/>

  <h3>Parts</h3>

  {loaded&&parts.map(p=>
   <div className="charge" key={p.id}>

    <input
     placeholder="Part #"
     value={p.part_number||''}
     onChange={e=>
      updatePart(p.id,{
       part_number:e.target.value
      })
     }
    />

    <input
     placeholder="Description"
     value={p.description||''}
     onChange={e=>
      updatePart(p.id,{
       description:e.target.value
      })
     }
    />

    <input
     type="number"
     step="0.01"
     placeholder="Qty"
     value={p.quantity}
     onChange={e=>
      updatePart(p.id,{
       quantity:e.target.value
      })
     }
    />

    <input
     type="number"
     step="0.01"
     placeholder="Price"
     value={p.unit_price}
     onChange={e=>
      updatePart(p.id,{
       unit_price:e.target.value
      })
     }
    />

    <b>
     {money(
      Number(p.quantity||0)*
      Number(p.unit_price||0)
     )}
    </b>

    <button
     className="small danger"
     onClick={()=>deletePart(p.id)}
    >
     Remove
    </button>

   </div>
  )}

  <button className="small" onClick={addPart}>
   ＋ Add Part
  </button>

  <div className="subtotal">
   Parts: {money(partsSubtotal)}
  </div>

  <hr/>

  <h3>Labor</h3>

  {loaded&&labor.map(l=>
   <div className="charge" key={l.id}>

    <input
     placeholder="Description"
     value={l.description||''}
     onChange={e=>
      updateLabor(l.id,{
       description:e.target.value
      })
     }
    />

    <input
     type="number"
     step="0.01"
     placeholder="Hours"
     value={l.hours}
     onChange={e=>
      updateLabor(l.id,{
       hours:e.target.value
      })
     }
    />

    <input
     type="number"
     step="0.01"
     placeholder="Rate"
     value={l.hourly_rate}
     onChange={e=>
      updateLabor(l.id,{
       hourly_rate:e.target.value
      })
     }
    />

    <b>
     {money(
      Number(l.hours||0)*
      Number(l.hourly_rate||0)
     )}
    </b>

    <button
     className="small danger"
     onClick={()=>deleteLabor(l.id)}
    >
     Remove
    </button>

   </div>
  )}

  <button className="small" onClick={addLabor}>
   ＋ Add Labor
  </button>

  <div className="subtotal">
   Labor: {money(laborSubtotal)}
  </div>

  <hr/>

  <Field
   l="Tax Rate (%)"
   k="tax_rate"
   f={form}
   s={setForm}
   type="number"
  />

  <div className="totals">
   <div>
    <span>Parts</span>
    <b>{money(partsSubtotal)}</b>
   </div>

   <div>
    <span>Labor</span>
    <b>{money(laborSubtotal)}</b>
   </div>

   <div>
    <span>Subtotal</span>
    <b>{money(subtotal)}</b>
   </div>

   <div>
    <span>Tax</span>
    <b>{money(tax)}</b>
   </div>

   <div className="grandtotal">
    <span>Total</span>
    <b>{money(total)}</b>
   </div>
  </div>

  <Field
   l="Work Performed"
   k="work_performed"
   f={form}
   s={setForm}
   area
  />

  <Field
   l="Technician Notes"
   k="technician_notes"
   f={form}
   s={setForm}
   area
  />

  <button onClick={()=>save('tickets',form)}>
   Save Ticket
  </button>

 </div>;
}

function Field({
 l,k,f,s,area,type='text'
}){
 return <label>
  {l}

  {area
   ? <textarea
      value={f[k]||''}
      onChange={e=>
       s({...f,[k]:e.target.value})
      }
     />
   : <input
      type={type}
      step={type==='number'?'0.01':undefined}
      value={f[k]??''}
      onChange={e=>
       s({...f,[k]:e.target.value})
      }
     />
  }

 </label>;
}

function Select({
 l,k,f,s,opts
}){
 return <label>
  {l}

  <select
   value={f[k]||''}
   onChange={e=>
    s({...f,[k]:e.target.value})
   }
  >
   <option value="">Select…</option>

   {opts.map(([v,t])=>
    <option key={v} value={v}>
     {t}
    </option>
   )}
  </select>

 </label>;
}

function Modal({title,close,children}){
 return <div className="overlay">
  <div className="modal">

   <div className="modalhead">
    <h2>{title}</h2>

    <button
     className="ghost dark"
     onClick={close}
    >
     ✕
    </button>
   </div>

   {children}

  </div>
 </div>;
}

createRoot(
 document.getElementById('root')
).render(<App/>);
