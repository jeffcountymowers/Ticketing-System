1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
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
