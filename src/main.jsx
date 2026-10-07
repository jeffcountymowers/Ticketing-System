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
 'REPAIRING','READY FOR PICKUP','PENDING DELIVERY','COMPLETED'
];

const commonEquipmentBrands=['Ariens','Bad Boy','BigDog','Bobcat','Craftsman','Cub Cadet','Exmark','Ferris','Gravely','Husqvarna','Hustler','John Deere','Kubota','Scag','Simplicity','Snapper','Toro','Troy-Bilt','Walker'];
const commonEngineBrands=['Briggs & Stratton','Honda','Kawasaki','Kohler','Kubota','Tecumseh','Vanguard','Yamaha'];

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
 notes:'',quantity_on_hand:0,cost:0,supplier:'',bin_location:'',low_stock_level:0
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
 pickup_date:'',
 pickup_time:'',
 delivery_date:'',
 delivery_time:'',
 status:'NEW',
 tax_rate:0,
 archived:false,
 archived_at:null,transport_status:'',pickup_delivery_type:'',handoff_completed_at:null
};

const money=n=>Number(n||0).toLocaleString(
 'en-US',
 {style:'currency',currency:'USD'}
);

function App(){

 useEffect(()=>{
  if(!('serviceWorker' in navigator))return;

  let checking=false;

  const checkForAppUpdate=async()=>{
   if(checking)return;
   checking=true;

   try{
    const registration=await navigator.serviceWorker.getRegistration();

    if(registration){
     await registration.update();
    }
   }catch(err){
    console.warn('JeffCo update check failed',err);
   }finally{
    checking=false;
   }
  };

  const controllerChanged=()=>{
   window.location.reload();
  };

  navigator.serviceWorker.addEventListener(
   'controllerchange',
   controllerChanged
  );

  checkForAppUpdate();

  const updateTimer=setInterval(
   checkForAppUpdate,
   60000
  );

  const wakeCheck=()=>{
   if(document.visibilityState==='visible'){
    checkForAppUpdate();
   }
  };

  document.addEventListener(
   'visibilitychange',
   wakeCheck
  );
  window.addEventListener('focus',checkForAppUpdate);
  window.addEventListener('online',checkForAppUpdate);

  return()=>{
   clearInterval(updateTimer);
   navigator.serviceWorker.removeEventListener(
    'controllerchange',
    controllerChanged
   );
   document.removeEventListener(
    'visibilitychange',
    wakeCheck
   );
   window.removeEventListener('focus',checkForAppUpdate);
   window.removeEventListener('online',checkForAppUpdate);
  };
 },[]);

 const [session,setSession]=useState(null);
 const [tab,setTab]=useState('Dashboard');
 const [customers,setCustomers]=useState([]);
 const [equipment,setEquipment]=useState([]);
 const [tickets,setTickets]=useState([]);
 const [partsCatalog,setPartsCatalog]=useState([]);
 const [schedule,setSchedule]=useState([]);
 const [communications,setCommunications]=useState([]);
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
   .on('postgres_changes',{event:'*',schema:'public',table:'schedule'},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'customer_communications'},refresh)
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

  const [c,e,t,p,sc,cm]=await Promise.all([

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
    .order('part_number'),

    sb.from('schedule').select('*').order('scheduled_date',{ascending:true}),
    sb.from('customer_communications').select('*').order('created_at',{ascending:false})

  ]);

  const err=c.error||e.error||t.error||p.error||sc.error||cm.error;

  if(err)setError(err.message);

  setCustomers(c.data||[]);
  setEquipment(e.data||[]);
  setTickets(t.data||[]);
  setPartsCatalog(p.data||[]);
   setSchedule(sc.data||[]);
   setCommunications(cm.data||[]);

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
    if(clean.cost==='' || clean.cost==null) clean.cost=0;
    if(clean.quantity_on_hand==='' || clean.quantity_on_hand==null) clean.quantity_on_hand=0;
    if(clean.low_stock_level==='' || clean.low_stock_level==null) clean.low_stock_level=0;
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

 const ticketSearchRecord=t=>{
  const c=customers.find(x=>x.id===t.customer_id)||{};
  const e=equipment.find(x=>x.id===t.equipment_id)||{};
  return {...t,...c,equipment_type:e.equipment_type,manufacturer:e.manufacturer,equipment_model:e.model,serial_number:e.serial_number,engine:e.engine,engine_model:e.engine_model};
 };
 const filteredTickets=activeTickets.filter(t=>search(ticketSearchRecord(t)));
 const filteredArchivedTickets=archivedTickets.filter(t=>search(ticketSearchRecord(t))); if(!session){

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
    'Schedule',
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
           Price: {money(p.price)} · Stock: {p.quantity_on_hand??0}{Number(p.quantity_on_hand||0)<=Number(p.low_stock_level||0)?' · LOW STOCK':''}
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
       equipment={equipment}
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

  <Field l="Quantity On Hand" k="quantity_on_hand" f={form} s={setForm} type="number" />
  <Field l="Cost" k="cost" f={form} s={setForm} type="number" />
  <Field l="Supplier" k="supplier" f={form} s={setForm} />
  <Field l="Bin / Shelf Location" k="bin_location" f={form} s={setForm} />
  <Field l="Low Stock Alert At" k="low_stock_level" f={form} s={setForm} type="number" />

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
 customers,
 equipment
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

  <SuggestField l="Manufacturer" k="manufacturer" f={form} s={setForm} opts={[...new Set([...commonEquipmentBrands,...equipment.map(x=>x.manufacturer).filter(Boolean)])].sort()} />

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

  <SuggestField l="Engine" k="engine" f={form} s={setForm} opts={[...new Set([...commonEngineBrands,...equipment.map(x=>x.engine).filter(Boolean)])].sort()} />

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
 setPartsCatalog,
 communications,
 setCommunications,
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

 async function addCommunication(communicationType){
  if(!form.id){
   alert('Save the ticket first.');
   return;
  }

  const r=await sb
   .from('customer_communications')
   .insert({
    ticket_id:form.id,
    customer_id:form.customer_id||null,
    communication_type:communicationType
   })
   .select()
   .single();

  if(r.error){
   setError(r.error.message);
   return;
  }

  setCommunications(prev=>[r.data,...(prev||[])]);
  setNotice('Customer communication logged');
  setTimeout(()=>setNotice(''),2000);
 }

 function printInvoice(){
  const customer=customers.find(c=>c.id===form.customer_id);
  const machine=equipment.find(e=>e.id===form.equipment_id);
  const esc=v=>String(v??'').replace(/[&<>"]/g,ch=>({
   '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  }[ch]));

  const partsRows=parts.map(p=>`
   <tr>
    <td>${esc(p.part_number)}</td>
    <td>${esc(p.description)}</td>
    <td>${esc(p.quantity)}</td>
    <td>${money(p.unit_price)}</td>
    <td>${money(Number(p.quantity||0)*Number(p.unit_price||0))}</td>
   </tr>`).join('');

  const laborRows=labor.map(l=>`
   <tr>
    <td colspan="2">${esc(l.description)}</td>
    <td>${esc(l.hours)}</td>
    <td>${money(l.hourly_rate)}</td>
    <td>${money(Number(l.hours||0)*Number(l.hourly_rate||0))}</td>
   </tr>`).join('');

  const html=`<!doctype html><html><head><title>JeffCo Invoice #${esc(form.ticket_number||'')}</title>
   <style>
    body{font-family:Arial,sans-serif;padding:28px;color:#111}
    h1{margin:0}.muted{color:#666}table{width:100%;border-collapse:collapse;margin-top:18px}
    th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}
    .totals{margin-left:auto;margin-top:20px;width:320px}
    .totals div{display:flex;justify-content:space-between;padding:5px 0}
    .grand{font-size:20px;font-weight:bold;border-top:2px solid #111;margin-top:5px;padding-top:10px}
    @media print{button{display:none}}
   </style></head><body>
   <h1>JeffCo Lawn Mower Repair</h1>
   <div class="muted">Repair Invoice · Ticket #${esc(form.ticket_number||'New')}</div>
   <h3>${esc(customer?.name||'Customer')}</h3>
   <div>${esc(customer?.phone||'')}</div>
   <div>${esc([customer?.address,customer?.city].filter(Boolean).join(', '))}</div>
   <p><b>Equipment:</b> ${esc([machine?.manufacturer,machine?.model].filter(Boolean).join(' ')||machine?.equipment_type||'')}</p>
   <p><b>Customer Issue:</b> ${esc(form.customer_issue||'')}</p>
   <p><b>Work Performed:</b> ${esc(form.work_performed||'')}</p>
   <table><thead><tr><th>Part #</th><th>Description</th><th>Qty/Hrs</th><th>Rate</th><th>Total</th></tr></thead>
   <tbody>${partsRows}${laborRows}</tbody></table>
   <div class="totals">
    <div><span>Parts</span><b>${money(partsSubtotal)}</b></div>
    <div><span>Labor</span><b>${money(laborSubtotal)}</b></div>
    <div><span>Pickup & Delivery</span><b>${money(pickupDeliveryCost)}</b></div>
    <div><span>Subtotal</span><b>${money(subtotal)}</b></div>
    <div><span>Tax</span><b>${money(tax)}</b></div>
    <div class="grand"><span>Total</span><b>${money(total)}</b></div>
   </div>
   <script>window.onload=()=>window.print();<\/script>
   </body></html>`;

  const w=window.open('','_blank');
  if(!w){
   alert('Allow pop-ups to print or save the invoice.');
   return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
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

   <div className="charge">
    <Field l="Pickup Date" k="pickup_date" f={form} s={setForm} type="date" />
    <Field l="Pickup Time" k="pickup_time" f={form} s={setForm} type="time" />
   </div>

   <div className="charge">
    <Field l="Delivery Date" k="delivery_date" f={form} s={setForm} type="date" />
    <Field l="Delivery Time" k="delivery_time" f={form} s={setForm} type="time" />
   </div>

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
       step="1"
       min="1"
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

   <section className="intakebox"><div className="sectionhead"><h3>Customer Communication</h3></div>{!form.archived&&<div className="rowactions">{['CALLED CUSTOMER','LEFT VOICEMAIL','ESTIMATE APPROVED','ESTIMATE DECLINED','CUSTOMER NOTIFIED READY'].map(type=><button className="small" key={type} onClick={()=>addCommunication(type)}>{type}</button>)}</div>}{(communications||[]).filter(x=>x.ticket_id===form.id).slice(0,8).map(x=><small key={x.id}>{new Date(x.created_at).toLocaleString()} · {x.communication_type}</small>)}</section>

   <button className="small" onClick={printInvoice}>Print / Save Invoice PDF</button>

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

function SuggestField({l,k,f,s,opts}){
 const id=`list-${k}`; return <label>{l}<input list={id} value={f[k]||''} onChange={e=>s({...f,[k]:e.target.value})}/><datalist id={id}>{opts.map(x=><option key={x} value={x}/>)}</datalist></label>;
}

function SchedulePage({schedule,customers,equipment,tickets,setError,setNotice,reload}){
 const today=new Date().toISOString().slice(0,10); const [date,setDate]=useState(today),[type,setType]=useState('PICKUP'),[customerId,setCustomerId]=useState(''),[ticketId,setTicketId]=useState(''),[time,setTime]=useState(''),[notes,setNotes]=useState('');
 const day=schedule.filter(x=>x.scheduled_date===date&&x.status!=='CANCELLED'), pickups=day.filter(x=>x.schedule_type==='PICKUP'), deliveries=day.filter(x=>x.schedule_type==='DELIVERY'); const cname=id=>customers.find(x=>x.id===id)?.name||'Customer'; const selectedCustomer=customers.find(x=>x.id===customerId);
 async function add(){if(!customerId){alert('Select a customer.');return;} const count=type==='PICKUP'?pickups.length:deliveries.length; let override=false; if(count>=2){override=confirm(`${type==='PICKUP'?'Pickup':'Delivery'} limit reached for ${date} — 2 of 2 scheduled. Override daily limit?`);if(!override)return;} const t=tickets.find(x=>x.id===ticketId), e=t?equipment.find(x=>x.id===t.equipment_id):null; const r=await sb.from('schedule').insert({ticket_id:ticketId||null,customer_id:customerId,equipment_id:e?.id||null,schedule_type:type,scheduled_date:date,scheduled_time:time||null,address:selectedCustomer?.address||'',city:selectedCustomer?.city||'',notes,limit_override:override}).select().single(); if(r.error){setError(r.error.message);return;} setNotice('Scheduled');setTimeout(()=>setNotice(''),2000);await reload();}
 async function complete(x){const status=x.schedule_type==='PICKUP'?'PICKED_UP':'DELIVERED',now=new Date().toISOString();const r=await sb.from('schedule').update({status,completed_at:now}).eq('id',x.id);if(r.error){setError(r.error.message);return;}if(x.ticket_id){if(x.schedule_type==='PICKUP')await sb.from('tickets').update({transport_status:'PICKED_UP'}).eq('id',x.ticket_id);else await sb.from('tickets').update({transport_status:'DELIVERED',handoff_completed_at:now,archived:true,archived_at:now,status:'COMPLETED'}).eq('id',x.ticket_id);}await reload();}
 function route(x){const a=[x.address,x.city].filter(Boolean).join(', ');if(!a){alert('No customer address saved.');return;}window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}`,'_blank');}
 function routeDay(){const stops=day.filter(x=>x.status==='SCHEDULED'&&x.address);if(!stops.length){alert('No scheduled addresses for this day.');return;}const dest=encodeURIComponent([stops.at(-1).address,stops.at(-1).city].filter(Boolean).join(', ')),way=stops.slice(0,-1).map(x=>encodeURIComponent([x.address,x.city].filter(Boolean).join(', '))).join('%7C');window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}${way?`&waypoints=${way}`:''}`,'_blank');}
 const waiting=tickets.filter(t=>!t.archived&&t.pickup_delivery_type==='PICKUP'&&(!t.transport_status||t.transport_status==='WAITING_FOR_PICKUP'));
 return <><div className="top"><div><h2>Schedule</h2><p className="muted">Pickups {pickups.length}/2 · Deliveries {deliveries.length}/2</p></div><button onClick={routeDay}>Route Today's Stops</button></div><section className="panel"><div className="form"><Field l="Date" k="date" f={{date}} s={x=>setDate(x.date)} type="date"/><label>Type<select value={type} onChange={e=>setType(e.target.value)}><option>PICKUP</option><option>DELIVERY</option></select></label><label>Customer<select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Select…</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Ticket<select value={ticketId} onChange={e=>setTicketId(e.target.value)}><option value="">Optional…</option>{tickets.filter(t=>!t.archived&&(!customerId||t.customer_id===customerId)).map(t=><option key={t.id} value={t.id}>#{t.ticket_number}</option>)}</select></label><Field l="Time" k="time" f={{time}} s={x=>setTime(x.time)} type="time"/><Field l="Notes" k="notes" f={{notes}} s={x=>setNotes(x.notes)} area/><button onClick={add}>Add to Schedule</button></div></section><section className="panel"><h3>{date} — Scheduled Stops</h3>{!day.length&&<div className="empty">Nothing scheduled.</div>}{day.map(x=><div className="row" key={x.id}><div><b>{x.schedule_type} · {cname(x.customer_id)}</b><small>{x.scheduled_time||'No time'} · {[x.address,x.city].filter(Boolean).join(', ')}</small><small>{x.status}{x.limit_override?' · LIMIT OVERRIDE':''}</small></div><div className="rowactions"><button className="small" onClick={()=>route(x)}>Navigate</button>{x.status==='SCHEDULED'&&<button className="small" onClick={()=>complete(x)}>{x.schedule_type==='PICKUP'?'Picked Up':'Delivered'}</button>}</div></div>)}</section>{waiting.length>0&&<section className="panel"><h3>Waiting for Pickup</h3>{waiting.map(t=><div className="row" key={t.id}><div><b>Ticket #{t.ticket_number} · {cname(t.customer_id)}</b><small>Not yet picked up</small></div></div>)}</section>}</>;
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
