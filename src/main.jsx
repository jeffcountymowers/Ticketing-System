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

const approvals=[
 'PENDING','APPROVED','DECLINED','NOT_REQUIRED'
];

const blankCustomer={
 name:'',phone:'',address:'',city:'',notes:''
};

const blankCatalogPart={
 part_number:'',
 description:'',
 price:'',
 notes:''
};

const blankEquipment={
 customer_id:'',
 equipment_type:'',
 manufacturer:'',
 model:'',
 serial_number:'',
 engine:'',
 engine_model:'',
 notes:''
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
 pickup_delivery_details:'',
 pickup_delivery_cost:0,
 status:'NEW',
 tax_rate:0,
 archived:false,
 archived_at:null
};

const money=n=>Number(n||0).toLocaleString(
 'en-US',
 {style:'currency',currency:'USD'}
);

function App(){

 const [session,setSession]=useState(null);
 const [tab,setTab]=useState('Dashboard');
 const [customers,setCustomers]=useState([]);
 const [equipment,setEquipment]=useState([]);
 const [tickets,setTickets]=useState([]);
 const [partsCatalog,setPartsCatalog]=useState([]);
 const [loading,setLoading]=useState(true);
 const [q,setQ]=useState('');
 const [modal,setModal]=useState(null);
 const [form,setForm]=useState(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');

 useEffect(()=>{

  sb.auth.getSession().then(({data})=>
   setSession(data.session)
  );

  const {data}=sb.auth.onAuthStateChange(
   (_event,currentSession)=>
    setSession(currentSession)
  );

  return()=>data.subscription.unsubscribe();

 },[]);

 useEffect(()=>{
  if(session)load();
 },[session]);

 useEffect(()=>{
  if(!session)return;

  let refreshTimer;

  const refresh=()=>{
   clearTimeout(refreshTimer);
   refreshTimer=setTimeout(
    ()=>load(false),
    200
   );
  };

  const channel=sb
   .channel('jeffco-live-sync-v2')
   .on('postgres_changes',{event:'*',schema:'public',table:'customers'},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'equipment'},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'tickets'},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'ticket_parts'},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'ticket_labor'},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'parts_catalog'},refresh)
   .subscribe();

  // iPhones can pause WebSocket connections when the app is backgrounded.
  // This lightweight fallback keeps every open JeffCo device current even
  // if Realtime is temporarily suspended.
  const poll=setInterval(()=>{
   if(document.visibilityState==='visible'){
    load(false);
   }
  },5000);

  const wakeRefresh=()=>{
   if(document.visibilityState==='visible'){
    load(false);
   }
  };

  document.addEventListener('visibilitychange',wakeRefresh);
  window.addEventListener('focus',wakeRefresh);
  window.addEventListener('online',wakeRefresh);

  return()=>{
   clearTimeout(refreshTimer);
   clearInterval(poll);
   document.removeEventListener('visibilitychange',wakeRefresh);
   window.removeEventListener('focus',wakeRefresh);
   window.removeEventListener('online',wakeRefresh);
   sb.removeChannel(channel);
  };
 },[session]);


 async function load(showSpinner=true){

  if(showSpinner)setLoading(true);

  const [c,e,t,p]=await Promise.all([

   sb.from('customers')
    .select('*')
    .order('name'),

   sb.from('equipment')
    .select('*')
    .order('created_at',{ascending:false}),

   sb.from('tickets')
    .select('*')
    .order('created_at',{ascending:false}),

   sb.from('parts_catalog')
    .select('*')
    .order('part_number')

  ]);

  const err=c.error||e.error||t.error||p.error;

  if(err)setError(err.message);

  setCustomers(c.data||[]);
  setEquipment(e.data||[]);
  setTickets(t.data||[]);
  setPartsCatalog(p.data||[]);

  if(showSpinner)setLoading(false);
 }

 async function save(table,data){

  setError('');

  const clean={...data};

  if(table==='tickets'){
   if(clean.estimate==='') clean.estimate=null;
   if(clean.tax_rate==='' || clean.tax_rate==null) clean.tax_rate=0;
   if(clean.pickup_delivery_cost==='' || clean.pickup_delivery_cost==null) clean.pickup_delivery_cost=0;
  }

  if(table==='parts_catalog'){
   if(clean.price==='' || clean.price==null) clean.price=0;
  }

  const r=await sb
   .from(table)
   .upsert(clean)
   .select()
   .single();

  if(r.error){
   setError(r.error.message);
   return;
  }

  setModal(null);

  setNotice('Saved successfully');

  setTimeout(
   ()=>setNotice(''),
   2000
  );

  await load();
 }

 async function remove(table,id){

  if(!confirm('Delete this record?')){
   return;
  }

  const r=await sb
   .from(table)
   .delete()
   .eq('id',id);

  if(r.error){
   setError(r.error.message);
  }else{
   load();
  }
 }

 async function login(e){

  e.preventDefault();

  const r=await sb.auth.signInWithPassword({
   email:e.target.email.value,
   password:e.target.password.value
  });

  if(r.error){
   setError(r.error.message);
  }
 }

 const customerName=id=>
  customers.find(
   x=>x.id===id
  )?.name||'—';

 const equipmentName=id=>{

  const x=equipment.find(
   y=>y.id===id
  );

  return x
   ? (
      [x.manufacturer,x.model]
       .filter(Boolean)
       .join(' ')
      ||
      x.equipment_type
      ||
      'Equipment'
     )
   :'—';
 };

 const search=x=>
  JSON.stringify(x)
   .toLowerCase()
   .includes(q.toLowerCase());

 const filteredCustomers=
  customers.filter(search);

 const filteredEquipment=
  equipment.filter(search);

 const filteredPartsCatalog=
  partsCatalog.filter(search);

 const activeTickets=
  tickets.filter(
   t=>!t.archived
  );

 const archivedTickets=
  tickets.filter(
   t=>t.archived
  );

 const filteredTickets=
  activeTickets.filter(t=>
   search({
    ...t,
    customer:customerName(
     t.customer_id
    ),
    equipment:equipmentName(
     t.equipment_id
    )
   })
  );

 const filteredArchivedTickets=
  archivedTickets.filter(t=>
   search({
    ...t,
    customer:customerName(
     t.customer_id
    ),
    equipment:equipmentName(
     t.equipment_id
    )
   })
  );

 if(!session){

  return <Login
   error={error}
   login={login}
  />;

 }

 return <div className="app">

  <header>

   <div>
    <h1>JeffCo</h1>
    <span>Lawn Mower Repair</span>
   </div>

   <button
    className="ghost"
    onClick={()=>sb.auth.signOut()}
   >
    Sign out
   </button>

  </header>

  <nav>

   {[
    'Dashboard',
    'Customers',
    'Equipment',
    'Parts',
    'Tickets',
    'Filed Tickets'
   ].map(x=>

    <button
     key={x}
     className={
      tab===x?'active':''
     }
     onClick={()=>{
      setTab(x);
      setQ('');
     }}
    >
     {x}
    </button>

   )}

  </nav>

  <main>

   {error&&
    <div className="alert">
     {error}
    </div>
   }

   {notice&&
    <div className="notice">
     {notice}
    </div>
   }

   {loading

    ? <div className="panel">
       Loading…
      </div>

    : <>

     {tab==='Dashboard'&&<>

      <div className="top">

       <div>
        <h2>Dashboard</h2>

        <p className="muted">
         JeffCo repair shop
        </p>
       </div>

       <button
        onClick={()=>{
         setForm({
          ...blankTicket
         });

         setModal('ticket');
        }}
       >
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

         <b>
          {
           activeTickets.filter(
            t=>t.status===s
           ).length
          }
         </b>

         <span>{s}</span>

        </button>

       )}

      </div>

      <section className="panel">

       <h3>Recent Tickets</h3>

       {activeTickets
        .slice(0,8)
        .map(t=>

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
        setForm({
         ...blankCustomer
        });

        setModal('customer');
       }}
      />

      <Search
       q={q}
       setQ={setQ}
      />

      <section className="panel">

       {filteredCustomers.map(c=>

        <div
         className="row"
         key={c.id}
        >

         <div>

          <b>{c.name}</b>

          <small>
           {c.phone||'No phone'}
          </small>

          <small>
           {
            [c.address,c.city]
             .filter(Boolean)
             .join(', ')
            ||
            'No address'
           }
          </small>

         </div>

         <div className="rowactions">

          <button
           className="small"
           onClick={()=>{
            setForm(c);
            setModal('customerRecord');
           }}
          >
           Open
          </button>

          <button
           className="small danger"
           onClick={()=>
            remove(
             'customers',
             c.id
            )
           }
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
        setForm({
         ...blankEquipment
        });

        setModal('equipment');
       }}
      />

      <Search
       q={q}
       setQ={setQ}
      />

      <section className="panel">

       {filteredEquipment.map(x=>

        <div
         className="row"
         key={x.id}
        >

         <div>

          <b>
           {
            [
             x.manufacturer,
             x.model
            ]
            .filter(Boolean)
            .join(' ')
            ||
            x.equipment_type
            ||
            'Equipment'
           }
          </b>

          <small>
           {
            customerName(
             x.customer_id
            )
           }
          </small>

          <small>
           S/N: {
            x.serial_number
            ||
            '—'
           }
          </small>

         </div>

         <div className="rowactions">

          <button
           className="small"
           onClick={()=>{
            setForm(x);
            setModal('equipment');
           }}
          >
           Edit
          </button>

          <button
           className="small danger"
           onClick={()=>
            remove(
             'equipment',
             x.id
            )
           }
          >
           Delete
          </button>

         </div>

        </div>

       )}

      </section>

     </>}

     {tab==='Parts'&&<>

      <PageTop
       title="Parts"
       button="New Part"
       click={()=>{
        setForm({
         ...blankCatalogPart
        });

        setModal('part');
       }}
      />

      <Search
       q={q}
       setQ={setQ}
      />

      <section className="panel">

       {!filteredPartsCatalog.length&&
        <div className="empty">
         No parts found.
        </div>
       }

       {filteredPartsCatalog.map(p=>

        <div
         className="row"
         key={p.id}
        >

         <div>

          <b>
           {p.part_number||'No part number'}
          </b>

          <small>
           {p.description||'No description'}
          </small>

          <small>
           Price: {money(p.price)}
          </small>

         </div>

         <div className="rowactions">

          <button
           className="small"
           onClick={()=>{
            setForm(p);
            setModal('part');
           }}
          >
           Edit
          </button>

          <button
           className="small danger"
           onClick={()=>
            remove(
             'parts_catalog',
             p.id
            )
           }
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
        setForm({
         ...blankTicket
        });

        setModal('ticket');
       }}
      />

      <Search
       q={q}
       setQ={setQ}
      />

      <section className="panel">

       {!filteredTickets.length&&
        <div className="empty">
         No active tickets found.
        </div>
       }

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
         remove={()=>
          remove(
           'tickets',
           t.id
          )
         }
        />

       )}

      </section>

     </>}

     {tab==='Filed Tickets'&&<>

      <div className="top">

       <div>

        <h2>
         Filed Tickets
        </h2>

        <p className="muted">
         Closed repair tickets and service history
        </p>

       </div>

      </div>

      <Search
       q={q}
       setQ={setQ}
      />

      <section className="panel">

       {!filteredArchivedTickets.length&&
        <div className="empty">
         No filed tickets found.
        </div>
       }

       {filteredArchivedTickets.map(t=>

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

    </>

   }

  </main>

  {modal&&

   <Modal
    title={
     modal==='customer'
      ?'Customer'
      :modal==='customerRecord'
       ?'Customer Record'
       :modal==='equipment'
        ?'Equipment'
        :modal==='part'
         ?'Part'
         :'Repair Ticket'
    }
    close={()=>
     setModal(null)
    }
   >

    {modal==='customer'&&
     <CustomerForm
      form={form}
      setForm={setForm}
      save={save}
     />
    }

    {modal==='customerRecord'&&
     <CustomerRecord
      customer={form}
      equipment={equipment}
      tickets={tickets}
      setForm={setForm}
      setModal={setModal}
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

    {modal==='part'&&
     <PartForm
      form={form}
      setForm={setForm}
      save={save}
     />
    }

    {modal==='ticket'&&
     <TicketForm
      form={form}
      setForm={setForm}
      customers={customers}
      setCustomers={setCustomers}
      equipment={equipment}
      setEquipment={setEquipment}
      partsCatalog={partsCatalog}
      setTickets={setTickets}
      setError={setError}
      setNotice={setNotice}
      setModal={setModal}
     />
    }

   </Modal>

  }

 </div>;
}

function PageTop({
 title,
 button,
 click
}){

 return <div className="top">

  <h2>{title}</h2>

  <button onClick={click}>
   ＋ {button}
  </button>

 </div>;
}

function Search({
 q,
 setQ
}){

 return <input
  className="search"
  placeholder="Search…"
  value={q}
  onChange={
   e=>setQ(
    e.target.value
   )
  }
 />;

}

function Login({
 error,
 login
}){

 return <div className="login">

  <div className="card">

   <div className="brandmark">
    J
   </div>

   <h1>JeffCo</h1>

   <p>
    Lawn Mower Repair
   </p>

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

    <button>
     Sign In
    </button>

   </form>

   {error&&
    <p className="error">
     {error}
    </p>
   }

  </div>

 </div>;
}

function TicketRow({
 t,
 customerName,
 equipmentName,
 edit,
 remove
}){

 return <div className="row ticket">

  <div>

   <b>
    Ticket #{t.ticket_number}
   </b>

   <small>
    {
     customerName(
      t.customer_id
     )
    }
    {' · '}
    {
     equipmentName(
      t.equipment_id
     )
    }
   </small>

   <small>
    {
     t.customer_issue
     ||
     'No issue entered'
    }
   </small>

   {t.archived&&t.archived_at&&
    <small>
     Filed: {
      new Date(
       t.archived_at
      ).toLocaleString()
     }
    </small>
   }

  </div>

  <span className="badge">
   {t.archived
    ?'FILED'
    :t.status
   }
  </span>

  <div className="rowactions">

   <button
    className="small"
    onClick={edit}
   >
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
function CustomerRecord({
 customer,
 equipment,
 tickets,
 setForm,
 setModal
}){

 const customerEquipment=
  equipment.filter(
   e=>e.customer_id===customer.id
  );

 const customerTickets=
  tickets.filter(
   t=>t.customer_id===customer.id
  );

 const equipmentLabel=id=>{

  const e=equipment.find(
   x=>x.id===id
  );

  if(!e){
   return 'No equipment selected';
  }

  return (
   [e.manufacturer,e.model]
    .filter(Boolean)
    .join(' ')
   ||
   e.equipment_type
   ||
   'Equipment'
  );
 };

 return <div className="form">

  <section className="intakebox">

   <div className="sectionhead">
    <h3>Customer Information</h3>
   </div>

   <div className="selectedcard">

    <div>

     <b>{customer.name}</b>

     <small>
      {customer.phone||'No phone'}
     </small>

     <small>
      {
       [customer.address,customer.city]
        .filter(Boolean)
        .join(', ')
       ||
       'No address'
      }
     </small>

     {customer.notes&&
      <small>
       Notes: {customer.notes}
      </small>
     }

    </div>

    <button
     className="small"
     onClick={()=>{
      setForm(customer);
      setModal('customer');
     }}
    >
     Edit Customer
    </button>

   </div>

  </section>


  <section className="intakebox">

   <div className="sectionhead">

    <h3>
     Equipment ({customerEquipment.length})
    </h3>

   </div>

   {!customerEquipment.length&&
    <div className="empty">
     No equipment saved for this customer.
    </div>
   }

   <div className="equipmentchoices">

    {customerEquipment.map(e=>{

     const label=
      [e.manufacturer,e.model]
       .filter(Boolean)
       .join(' ')
      ||
      e.equipment_type
      ||
      'Equipment';

     return <div
      className="equipmentchoice"
      key={e.id}
     >

      <b>{label}</b>

      <span>
       {e.equipment_type||'Equipment'}

       {e.serial_number
        ?` · S/N ${e.serial_number}`
        :''
       }
      </span>

      {e.engine&&
       <span>
        Engine: {e.engine}
        {e.engine_model
         ?` ${e.engine_model}`
         :''
        }
       </span>
      }

      <button
       className="small"
       onClick={()=>{
        setForm(e);
        setModal('equipment');
       }}
      >
       Edit Equipment
      </button>

     </div>;

    })}

   </div>

  </section>


  <section className="intakebox">

   <div className="sectionhead">

    <h3>
     Service History ({customerTickets.length})
    </h3>

   </div>

   {!customerTickets.length&&
    <div className="empty">
     No repair history for this customer.
    </div>
   }

   {customerTickets.map(t=>

    <div
     className="row ticket"
     key={t.id}
    >

     <div>

      <b>
       Ticket #{t.ticket_number}
      </b>

      <small>
       {equipmentLabel(t.equipment_id)}
      </small>

      <small>
       {t.customer_issue||'No issue entered'}
      </small>

      {t.archived&&t.archived_at&&
       <small>
        Filed: {
         new Date(
          t.archived_at
         ).toLocaleString()
        }
       </small>
      }

     </div>

     <span className="badge">
      {t.archived
       ?'FILED'
       :t.status
      }
     </span>

     <div className="rowactions">

      <button
       className="small"
       onClick={()=>{
        setForm(t);
        setModal('ticket');
       }}
      >
       Open Ticket
      </button>

     </div>

    </div>

   )}

  </section>

 </div>;
}

function CustomerForm({
 form,
 setForm,
 save
}){

 return <div className="form">

  <Field
   l="Name"
   k="name"
   f={form}
   s={setForm}
  />

  <Field
   l="Phone"
   k="phone"
   f={form}
   s={setForm}
  />

  <Field
   l="Address"
   k="address"
   f={form}
   s={setForm}
  />

  <Field
   l="City"
   k="city"
   f={form}
   s={setForm}
  />

  <Field
   l="Notes"
   k="notes"
   f={form}
   s={setForm}
   area
  />

  <button
   onClick={()=>
    save(
     'customers',
     form
    )
   }
  >
   Save Customer
  </button>

 </div>;
}

function PartForm({
 form,
 setForm,
 save
}){

 return <div className="form">

  <Field
   l="Part Number"
   k="part_number"
   f={form}
   s={setForm}
  />

  <Field
   l="Description"
   k="description"
   f={form}
   s={setForm}
  />

  <Field
   l="Price"
   k="price"
   f={form}
   s={setForm}
   type="number"
  />

  <Field
   l="Notes"
   k="notes"
   f={form}
   s={setForm}
   area
  />

  <button
   onClick={()=>
    save(
     'parts_catalog',
     {
      ...form,
      price:
       form.price===''
        ?0
        :form.price
     }
    )
   }
  >
   Save Part
  </button>

 </div>;
}

function EquipmentForm({
 form,
 setForm,
 save,
 customers
}){

 return <div className="form">

  <Select
   l="Customer"
   k="customer_id"
   f={form}
   s={setForm}
   opts={
    customers.map(
     c=>[
      c.id,
      c.name
     ]
    )
   }
  />

  <Field
   l="Equipment Type"
   k="equipment_type"
   f={form}
   s={setForm}
  />

  <Field
   l="Manufacturer"
   k="manufacturer"
   f={form}
   s={setForm}
  />

  <Field
   l="Model"
   k="model"
   f={form}
   s={setForm}
  />

  <Field
   l="Serial Number"
   k="serial_number"
   f={form}
   s={setForm}
  />

  <Field
   l="Engine"
   k="engine"
   f={form}
   s={setForm}
  />

  <Field
   l="Engine Model"
   k="engine_model"
   f={form}
   s={setForm}
  />

  <Field
   l="Notes"
   k="notes"
   f={form}
   s={setForm}
   area
  />

  <button
   onClick={()=>
    save(
     'equipment',
     form
    )
   }
  >
   Save Equipment
  </button>

 </div>;
}

function TicketForm({
 form,
 setForm,
 customers,
 setCustomers,
 equipment,
 setEquipment,
 partsCatalog,
 setTickets,
 setError,
 setNotice,
 setModal
}){

 const [parts,setParts]=useState([]);
 const [labor,setLabor]=useState([]);
 const [loaded,setLoaded]=useState(false);

 const [
  customerSearch,
  setCustomerSearch
 ]=useState('');

 const [
  showNewCustomer,
  setShowNewCustomer
 ]=useState(false);

 const [
  newCustomer,
  setNewCustomer
 ]=useState({
  ...blankCustomer
 });

 const [
  showNewEquipment,
  setShowNewEquipment
 ]=useState(false);

 const [
  newEquipment,
  setNewEquipment
 ]=useState({
  ...blankEquipment
 });

 const [saving,setSaving]=
  useState(false);

 const [
  catalogPartId,
  setCatalogPartId
 ]=useState('');

 useEffect(()=>{

  setParts([]);
  setLabor([]);
  setLoaded(false);

  if(form.id){
   loadCharges();
  }else{
   setLoaded(true);
  }

 },[form.id]);

 async function loadCharges(){

  const [p,l]=await Promise.all([

   sb.from('ticket_parts')
    .select('*')
    .eq(
     'ticket_id',
     form.id
    )
    .order('created_at'),

   sb.from('ticket_labor')
    .select('*')
    .eq(
     'ticket_id',
     form.id
    )
    .order('created_at')

  ]);

  const err=
   p.error||l.error;

  if(err){
   setError(err.message);
  }

  setParts(p.data||[]);
  setLabor(l.data||[]);
  setLoaded(true);
 }

 const selectedCustomer=
  customers.find(
   c=>c.id===form.customer_id
  );

 const customerMatches=
  customerSearch.trim()

   ? customers.filter(c=>{

      const s=
       customerSearch
        .trim()
        .toLowerCase();

      return [
       c.name,
       c.phone,
       c.address
      ].some(v=>
       (v||'')
        .toLowerCase()
        .includes(s)
      );

     }).slice(0,10)

   : [];

 const customerEquipment=
  equipment.filter(
   e=>
    e.customer_id===
    form.customer_id
  );

 function chooseCustomer(c){

  setForm({
   ...form,
   customer_id:c.id,
   equipment_id:''
  });

  setCustomerSearch('');
  setShowNewCustomer(false);
  setShowNewEquipment(false);

  setNewEquipment({
   ...blankEquipment,
   customer_id:c.id
  });
 }

 async function createCustomer(){

  if(!newCustomer.name.trim()){

   alert(
    'Enter the customer name.'
   );

   return;
  }

  setError('');

  const r=await sb
   .from('customers')
   .insert({
    ...newCustomer,
    name:
     newCustomer.name.trim()
   })
   .select()
   .single();

  if(r.error){

   setError(r.error.message);

   return;
  }

  setCustomers(prev=>

   [...prev,r.data].sort(
    (a,b)=>
     a.name.localeCompare(
      b.name
     )
   )

  );

  setForm({
   ...form,
   customer_id:r.data.id,
   equipment_id:''
  });

  setCustomerSearch('');

  setShowNewCustomer(false);

  setNewCustomer({
   ...blankCustomer
  });

  setNewEquipment({
   ...blankEquipment,
   customer_id:r.data.id
  });

  setNotice(
   'Customer created and selected'
  );

  setTimeout(
   ()=>setNotice(''),
   2000
  );
 }

 async function createEquipment(){

  if(!form.customer_id){

   alert(
    'Select or create a customer first.'
   );

   return;
  }

  if(
   !newEquipment.equipment_type.trim()
   &&
   !newEquipment.manufacturer.trim()
   &&
   !newEquipment.model.trim()
  ){

   alert(
    'Enter at least an equipment type, manufacturer, or model.'
   );

   return;
  }

  setError('');

  const r=await sb
   .from('equipment')
   .insert({
    ...newEquipment,
    customer_id:
     form.customer_id
   })
   .select()
   .single();

  if(r.error){

   setError(r.error.message);

   return;
  }

  setEquipment(prev=>
   [r.data,...prev]
  );

  setForm({
   ...form,
   equipment_id:r.data.id
  });

  setShowNewEquipment(false);

  setNewEquipment({
   ...blankEquipment,
   customer_id:
    form.customer_id
  });

  setNotice(
   'Equipment created and selected'
  );

  setTimeout(
   ()=>setNotice(''),
   2000
  );
 }

 async function saveTicketKeepOpen(){

  if(!form.customer_id){

   alert(
    'Select or create a customer first.'
   );

   return;
  }

  setSaving(true);
  setError('');

  const clean={...form};

  if(clean.estimate===''){
   clean.estimate=null;
  }

  const r=await sb
   .from('tickets')
   .upsert(clean)
   .select()
   .single();

  setSaving(false);

  if(r.error){

   setError(r.error.message);

   return;
  }

  const wasExisting=
   Boolean(form.id);

  setForm(r.data);

  setTickets(prev=>{

   const exists=
    prev.some(
     t=>t.id===r.data.id
    );

   return exists

    ? prev.map(
       t=>
        t.id===r.data.id
         ?r.data
         :t
      )

    : [r.data,...prev];

  });

  setNotice(
   wasExisting
    ?'Ticket saved'
    :'Ticket created — you can now add parts and labor'
  );

  setTimeout(
   ()=>setNotice(''),
   2500
  );
 }

 async function closeAndFileTicket(){

  if(!form.id){
   return;
  }

  if(form.status!=='COMPLETED'){

   alert(
    'Set the repair status to COMPLETED before filing this ticket.'
   );

   return;
  }

  if(
   !confirm(
    'Close and file this ticket? It will move to Filed Tickets.'
   )
  ){
   return;
  }

  setSaving(true);
  setError('');

  const archivedAt=
   new Date().toISOString();

  const r=await sb
   .from('tickets')
   .update({
    archived:true,
    archived_at:archivedAt
   })
   .eq('id',form.id)
   .select()
   .single();

  setSaving(false);

  if(r.error){

   setError(r.error.message);

   return;
  }

  setTickets(prev=>
   prev.map(t=>
    t.id===r.data.id
     ?r.data
     :t
   )
  );

  setNotice(
   `Ticket #${r.data.ticket_number} closed and filed`
  );

  setTimeout(
   ()=>setNotice(''),
   2500
  );

  setModal(null);
 }

 async function reopenTicket(){

  if(!form.id){
   return;
  }

  if(
   !confirm(
    'Reopen this filed ticket?'
   )
  ){
   return;
  }

  setSaving(true);
  setError('');

  const r=await sb
   .from('tickets')
   .update({
    archived:false,
    archived_at:null
   })
   .eq('id',form.id)
   .select()
   .single();

  setSaving(false);

  if(r.error){

   setError(r.error.message);

   return;
  }

  setTickets(prev=>
   prev.map(t=>
    t.id===r.data.id
     ?r.data
     :t
   )
  );

  setNotice(
   `Ticket #${r.data.ticket_number} reopened`
  );

  setTimeout(
   ()=>setNotice(''),
   2500
  );

  setModal(null);
 }

 async function addPart(){

  if(!form.id){

   alert(
    'Save the ticket first, then add parts.'
   );

   return;
  }

  const r=await sb
   .from('ticket_parts')
   .insert({
    ticket_id:form.id,
    part_number:'',
    description:'New Part',
    quantity:1,
    unit_price:0
   })
   .select()
   .single();

  if(r.error){

   setError(r.error.message);

   return;
  }

  setParts(prev=>
   [...prev,r.data]
  );
 }

 async function addCatalogPart(){

  if(!catalogPartId){
   alert('Select a saved part first.');
   return;
  }

  if(!form.id){
   alert(
    'Save the ticket first, then add parts.'
   );
   return;
  }

  const part=
   partsCatalog.find(
    p=>p.id===catalogPartId
   );

  if(!part){
   return;
  }

  const r=await sb
   .from('ticket_parts')
   .insert({
    ticket_id:form.id,
    part_number:
     part.part_number||'',
    description:
     part.description||'Part',
    quantity:1,
    unit_price:
     Number(part.price||0)
   })
   .select()
   .single();

  if(r.error){
   setError(r.error.message);
   return;
  }

  setParts(prev=>
   [...prev,r.data]
  );

  setCatalogPartId('');
 }

 async function addLabor(){

  if(!form.id){

   alert(
    'Save the ticket first, then add labor.'
   );

   return;
  }

  const r=await sb
   .from('ticket_labor')
   .insert({
    ticket_id:form.id,
    description:'Labor',
    hours:1,
    hourly_rate:0
   })
   .select()
   .single();

  if(r.error){

   setError(r.error.message);

   return;
  }

  setLabor(prev=>
   [...prev,r.data]
  );
 }

 async function updatePart(
  id,
  changes
 ){

  setParts(prev=>
   prev.map(p=>
    p.id===id
     ?{...p,...changes}
     :p
   )
  );

  const r=await sb
   .from('ticket_parts')
   .update(changes)
   .eq('id',id);

  if(r.error){
   setError(r.error.message);
  }
 }

 async function updateLabor(
  id,
  changes
 ){

  setLabor(prev=>
   prev.map(l=>
    l.id===id
     ?{...l,...changes}
     :l
   )
  );

  const r=await sb
   .from('ticket_labor')
   .update(changes)
   .eq('id',id);

  if(r.error){
   setError(r.error.message);
  }
 }

 async function deletePart(id){

  const r=await sb
   .from('ticket_parts')
   .delete()
   .eq('id',id);

  if(r.error){

   setError(r.error.message);

  }else{

   setParts(prev=>
    prev.filter(
     p=>p.id!==id
    )
   );

  }
 }

 async function deleteLabor(id){

  const r=await sb
   .from('ticket_labor')
   .delete()
   .eq('id',id);

  if(r.error){

   setError(r.error.message);

  }else{

   setLabor(prev=>
    prev.filter(
     l=>l.id!==id
    )
   );

  }
 }

 const partsSubtotal=
  parts.reduce(
   (sum,p)=>
    sum+
    Number(p.quantity||0)*
    Number(p.unit_price||0),
   0
  );

 const laborSubtotal=
  labor.reduce(
   (sum,l)=>
    sum+
    Number(l.hours||0)*
    Number(l.hourly_rate||0),
   0
  );

 const pickupDeliveryCost=
  Number(
   form.pickup_delivery_cost||0
  );

 const subtotal=
  partsSubtotal+
  laborSubtotal+
  pickupDeliveryCost;

 const tax=
  subtotal*
  (
   Number(form.tax_rate||0)
   /
   100
  );

 const total=
  subtotal+
  tax;

 return <div className="form">

  <div className="ticketnumber">

   Ticket #{
    form.ticket_number
    ||
    'New'
   }

   {form.archived&&
    <span>
     {' · FILED'}
    </span>
   }

  </div>

  <section className="intakebox">

   <div className="sectionhead">
    <h3>Customer</h3>
   </div>

   {selectedCustomer

    ? <div className="selectedcard">

       <div>

        <b>
         {selectedCustomer.name}
        </b>

        <small>

         {
          selectedCustomer.phone
          ||
          'No phone'
         }

         {
          selectedCustomer.address
           ?` · ${selectedCustomer.address}`
           :''
         }

        </small>

       </div>

       {!form.archived&&
        <button
         className="small"
         onClick={()=>{

          setForm({
           ...form,
           customer_id:'',
           equipment_id:''
          });

          setCustomerSearch('');

          setShowNewEquipment(
           false
          );

         }}
        >
         Change
        </button>
       }

      </div>

    : <>

       <input
        className="search"
        placeholder="Search by name, phone, or address…"
        value={customerSearch}
        onChange={e=>
         setCustomerSearch(
          e.target.value
         )
        }
       />

       {
        customerMatches.length>0
        &&
        <div className="searchresults">

         {customerMatches.map(c=>

          <button
           key={c.id}
           className="searchresult"
           onClick={()=>
            chooseCustomer(c)
           }
          >

           <b>{c.name}</b>

           <span>

            {
             c.phone
             ||
             'No phone'
            }

            {
             c.address
              ?` · ${c.address}`
              :''
            }

           </span>

          </button>

         )}

        </div>
       }

       {
        customerSearch.trim()
        &&
        !customerMatches.length
        &&
        <div className="empty">
         No matching customers.
        </div>
       }

       <button
        className="small"
        onClick={()=>
         setShowNewCustomer(
          !showNewCustomer
         )
        }
       >
        ＋ New Customer
       </button>

      </>
   }

   {
    showNewCustomer
    &&
    !selectedCustomer
    &&
    <div className="inlineform">

     <h4>
      New Customer
     </h4>

     <Field
      l="Name"
      k="name"
      f={newCustomer}
      s={setNewCustomer}
     />

     <Field
      l="Phone"
      k="phone"
      f={newCustomer}
      s={setNewCustomer}
     />

     <Field
      l="Address"
      k="address"
      f={newCustomer}
      s={setNewCustomer}
     />

     <Field
      l="Notes"
      k="notes"
      f={newCustomer}
      s={setNewCustomer}
      area
     />

     <button
      onClick={createCustomer}
     >
      Create & Select Customer
     </button>

    </div>
   }

  </section>

  {
   form.customer_id
   &&
   <section className="intakebox">

    <div className="sectionhead">
     <h3>Equipment</h3>
    </div>

    {
     customerEquipment.length>0
     &&
     <div className="equipmentchoices">

      {
       customerEquipment.map(e=>{

        const label=
         [
          e.manufacturer,
          e.model
         ]
         .filter(Boolean)
         .join(' ')
         ||
         e.equipment_type
         ||
         'Equipment';

        return <button
         key={e.id}
         className={
          form.equipment_id===e.id
           ?'equipmentchoice selected'
           :'equipmentchoice'
         }
         onClick={()=>{
          if(!form.archived){
           setForm({
            ...form,
            equipment_id:e.id
           });
          }
         }}
        >

         <b>{label}</b>

         <span>

          {
           e.equipment_type
           ||
           ''
          }

          {
           e.serial_number
            ?` · S/N ${e.serial_number}`
            :''
          }

         </span>

        </button>;

       })
      }

     </div>
    }

    {
     !customerEquipment.length
     &&
     !showNewEquipment
     &&
     <div className="empty">
      No equipment saved for this customer.
     </div>
    }

    {!form.archived&&
     <button
      className="small"
      onClick={()=>{

       setShowNewEquipment(
        !showNewEquipment
       );

       setNewEquipment({
        ...blankEquipment,
        customer_id:
         form.customer_id
       });

      }}
     >
      ＋ New Equipment
     </button>
    }

    {
     showNewEquipment
     &&
     !form.archived
     &&
     <div className="inlineform">

      <h4>
       New Equipment
      </h4>

      <Field
       l="Equipment Type"
       k="equipment_type"
       f={newEquipment}
       s={setNewEquipment}
      />

      <Field
       l="Manufacturer"
       k="manufacturer"
       f={newEquipment}
       s={setNewEquipment}
      />

      <Field
       l="Model"
       k="model"
       f={newEquipment}
       s={setNewEquipment}
      />

      <Field
       l="Serial Number"
       k="serial_number"
       f={newEquipment}
       s={setNewEquipment}
      />

      <Field
       l="Engine"
       k="engine"
       f={newEquipment}
       s={setNewEquipment}
      />

      <Field
       l="Engine Model"
       k="engine_model"
       f={newEquipment}
       s={setNewEquipment}
      />

      <Field
       l="Notes"
       k="notes"
       f={newEquipment}
       s={setNewEquipment}
       area
      />

      <button
       onClick={createEquipment}
      >
       Create & Select Equipment
      </button>

     </div>
    }

   </section>
  }

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

  <section className="intakebox">

   <div className="sectionhead">
    <h3>Work Performed</h3>
   </div>

   <Field
    l="Work Performed"
    k="work_performed"
    f={form}
    s={setForm}
    area
   />

  </section>

  <section className="intakebox">

   <div className="sectionhead">
    <h3>Pickup & Delivery</h3>
   </div>

   <Field
    l="Pickup / Delivery Details"
    k="pickup_delivery_details"
    f={form}
    s={setForm}
    area
   />

   <Field
    l="Pickup / Delivery Cost"
    k="pickup_delivery_cost"
    f={form}
    s={setForm}
    type="number"
   />

  </section>

  <Select
   l="Approval Status"
   k="approval_status"
   f={form}
   s={setForm}
   opts={
    approvals.map(
     x=>[x,x]
    )
   }
  />

  <Select
   l="Repair Status"
   k="status"
   f={form}
   s={setForm}
   opts={
    statuses.map(
     x=>[x,x]
    )
   }
  />

  {
   !form.id
   &&
   <div className="savefirst">
    <b>
     Save the ticket to enable parts and labor.
    </b>
   </div>
  }

  {!form.archived&&
   <button
    onClick={
     saveTicketKeepOpen
    }
    disabled={saving}
   >

    {
     saving
      ?'Saving…'
      :form.id
       ?'Save Ticket'
       :'Create Ticket & Continue'
    }

   </button>
  }

  {form.id&&<>

   <hr/>

   <h3>Parts</h3>

   {
    loaded
    &&
    parts.map(p=>

     <div
      className="charge"
      key={p.id}
     >

      <input
       placeholder="Part #"
       value={
        p.part_number||''
       }
       disabled={form.archived}
       onChange={e=>
        updatePart(
         p.id,
         {
          part_number:
           e.target.value
         }
        )
       }
      />

      <input
       placeholder="Description"
       value={
        p.description||''
       }
       disabled={form.archived}
       onChange={e=>
        updatePart(
         p.id,
         {
          description:
           e.target.value
         }
        )
       }
      />

      <input
       type="number"
       step="0.01"
       placeholder="Qty"
       value={p.quantity}
       disabled={form.archived}
       onChange={e=>
        updatePart(
         p.id,
         {
          quantity:
           e.target.value
         }
        )
       }
      />

      <input
       type="number"
       step="0.01"
       placeholder="Price"
       value={p.unit_price}
       disabled={form.archived}
       onChange={e=>
        updatePart(
         p.id,
         {
          unit_price:
           e.target.value
         }
        )
       }
      />

      <b>
       {
        money(
         Number(
          p.quantity||0
         )
         *
         Number(
          p.unit_price||0
         )
        )
       }
      </b>

      {!form.archived&&
       <button
        className="small danger"
        onClick={()=>
         deletePart(p.id)
        }
       >
        Remove
       </button>
      }

     </div>

    )
   }

   {!form.archived&&<>

    {partsCatalog.length>0&&
     <div className="inlineform">

      <label>
       Add Saved Part

       <select
        value={catalogPartId}
        onChange={e=>
         setCatalogPartId(
          e.target.value
         )
        }
       >
        <option value="">
         Select a part…
        </option>

        {partsCatalog.map(p=>
         <option
          key={p.id}
          value={p.id}
         >
          {
           [
            p.part_number,
            p.description,
            money(p.price)
           ]
            .filter(Boolean)
            .join(' · ')
          }
         </option>
        )}

       </select>

      </label>

      <button
       className="small"
       onClick={addCatalogPart}
      >
       ＋ Add Saved Part
      </button>

     </div>
    }

    <button
     className="small"
     onClick={addPart}
    >
     ＋ Add Manual Part
    </button>

   </>}

   <div className="subtotal">
    Parts: {
     money(partsSubtotal)
    }
   </div>

   <hr/>

   <h3>Labor</h3>

   {
    loaded
    &&
    labor.map(l=>

     <div
      className="charge"
      key={l.id}
     >

      <input
       placeholder="Description"
       value={
        l.description||''
       }
       disabled={form.archived}
       onChange={e=>
        updateLabor(
         l.id,
         {
          description:
           e.target.value
         }
        )
       }
      />

      <input
       type="number"
       step="0.01"
       placeholder="Hours"
       value={l.hours}
       disabled={form.archived}
       onChange={e=>
        updateLabor(
         l.id,
         {
          hours:
           e.target.value
         }
        )
       }
      />

      <input
       type="number"
       step="0.01"
       placeholder="Rate"
       value={
        l.hourly_rate
       }
       disabled={form.archived}
       onChange={e=>
        updateLabor(
         l.id,
         {
          hourly_rate:
           e.target.value
         }
        )
       }
      />

      <b>
       {
        money(
         Number(
          l.hours||0
         )
         *
         Number(
          l.hourly_rate||0
         )
        )
       }
      </b>

      {!form.archived&&
       <button
        className="small danger"
        onClick={()=>
         deleteLabor(l.id)
        }
       >
        Remove
       </button>
      }

     </div>

    )
   }

   {!form.archived&&
    <button
     className="small"
     onClick={addLabor}
    >
     ＋ Add Labor
    </button>
   }

   <div className="subtotal">
    Labor: {
     money(laborSubtotal)
    }
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
     <b>
      {money(partsSubtotal)}
     </b>
    </div>

    <div>
     <span>Labor</span>
     <b>
      {money(laborSubtotal)}
     </b>
    </div>

    <div>
     <span>Pickup & Delivery</span>
     <b>
      {money(pickupDeliveryCost)}
     </b>
    </div>

    <div>
     <span>Subtotal</span>
     <b>
      {money(subtotal)}
     </b>
    </div>

    <div>
     <span>Tax</span>
     <b>
      {money(tax)}
     </b>
    </div>

    <div className="grandtotal">
     <span>Total</span>
     <b>
      {money(total)}
     </b>
    </div>

   </div>

   <Field
    l="Technician Notes"
    k="technician_notes"
    f={form}
    s={setForm}
    area
   />

   {!form.archived&&
    <button
     onClick={
      saveTicketKeepOpen
     }
     disabled={saving}
    >
     {
      saving
       ?'Saving…'
       :'Save Ticket'
     }
    </button>
   }

   {
    !form.archived
    &&
    form.status==='COMPLETED'
    &&
    <button
     className="danger"
     onClick={
      closeAndFileTicket
     }
     disabled={saving}
    >
     Close & File Ticket
    </button>
   }

   {form.archived&&<>

    {form.archived_at&&
     <div className="savefirst">
      Filed {
       new Date(
        form.archived_at
       ).toLocaleString()
      }
     </div>
    }

    <button
     onClick={reopenTicket}
     disabled={saving}
    >
     Reopen Ticket
    </button>

   </>}

  </>}

 </div>;
}

function Field({
 l,
 k,
 f,
 s,
 area,
 type='text'
}){

 return <label>

  {l}

  {area

   ? <textarea
      value={f[k]||''}
      onChange={e=>
       s({
        ...f,
        [k]:e.target.value
       })
      }
     />

   : <input
      type={type}
      step={
       type==='number'
        ?'0.01'
        :undefined
      }
      value={f[k]??''}
      onChange={e=>
       s({
        ...f,
        [k]:e.target.value
       })
      }
     />

  }

 </label>;
}

function Select({
 l,
 k,
 f,
 s,
 opts
}){

 return <label>

  {l}

  <select
   value={f[k]||''}
   onChange={e=>
    s({
     ...f,
     [k]:e.target.value
    })
   }
  >

   <option value="">
    Select…
   </option>

   {opts.map(([v,t])=>

    <option
     key={v}
     value={v}
    >
     {t}
    </option>

   )}

  </select>

 </label>;
}

function Modal({
 title,
 close,
 children
}){

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
