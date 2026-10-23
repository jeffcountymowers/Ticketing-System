import React,{useEffect,useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import './sales.css';

const sb=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_ANON_KEY);
const fmt=n=>Number(n||0).toLocaleString('en-US',{style:'currency',currency:'USD'});
const emptyItem=()=>({inventory_part_id:'',part_number:'',description:'',quantity:1,unit_price:''});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=r=>`R-${String(r.receipt_number).padStart(6,'0')}`;
const sizes=['Letter','80mm','58mm'];
const getSize=()=>{try{return localStorage.getItem('jeffco-sales-print-size')||'Letter';}catch{return 'Letter';}};

export default function SalesReceipts({logo=''}){
 const [receipts,setReceipts]=useState([]),[catalog,setCatalog]=useState([]),[customers,setCustomers]=useState([]),[settings,setSettings]=useState({parts_tax_rate:0});
 const [itemsByReceipt,setItemsByReceipt]=useState({}),[auditByReceipt,setAuditByReceipt]=useState({});
 const [kind,setKind]=useState('PARTS'),[historyKind,setHistoryKind]=useState('PARTS'),[query,setQuery]=useState('');
 const [editing,setEditing]=useState(null),[customerId,setCustomerId]=useState(''),[customerName,setCustomerName]=useState('');
 const [payment,setPayment]=useState('CASH'),[items,setItems]=useState([emptyItem()]);
 const [equipment,setEquipment]=useState({equipment_type:'',make:'',model:'',serial:'',description:'',price:''});
 const [taxInput,setTaxInput]=useState(''),[printSize,setPrintSize]=useState(getSize);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [selected,setSelected]=useState(null),[override,setOverride]=useState(false);
 async function refresh(){
  const [r,i,c,u,s]=await Promise.all([
   sb.from('sales_receipts').select('*').order('created_at',{ascending:false}),
   sb.from('sales_receipt_items').select('*').order('position'),
   sb.from('parts_catalog').select('*').order('part_number'),
   sb.from('customers').select('id,name').order('name'),
   sb.from('sales_settings').select('*').eq('id',1).single()
  ]);
  const e=r.error||i.error||c.error||u.error||s.error;
  if(e){setError(e.message);return;}
  setReceipts(r.data||[]);setCatalog(c.data||[]);setCustomers(u.data||[]);setSettings(s.data||{parts_tax_rate:0});
  setTaxInput(String(s.data?.parts_tax_rate??0));
  const grouped={};(i.data||[]).forEach(x=>(grouped[x.receipt_id]??=[]).push(x));setItemsByReceipt(grouped);
 }
 useEffect(()=>{refresh();},[]);
 const subtotal=useMemo(()=>kind==='PARTS'?items.reduce((n,x)=>n+(Number(x.quantity)||0)*(Number(x.unit_price)||0),0):Number(equipment.price)||0,[items,equipment,kind]);
 const tax=kind==='PARTS'?Math.round(subtotal*Number(editing?.tax_rate??settings.parts_tax_rate)/100*100)/100:0;
 const visible=receipts.filter(r=>r.sale_type===historyKind&&JSON.stringify({...r,items:itemsByReceipt[r.id]}).toLowerCase().includes(query.toLowerCase()));
 const updateItem=(index,patch)=>setItems(a=>a.map((x,i)=>i===index?{...x,...patch}:x));
 const choosePart=(index,id)=>{const p=catalog.find(x=>x.id===id);updateItem(index,p?{inventory_part_id:p.id,part_number:p.part_number||'',description:p.description||p.part_number||'',unit_price:p.price??0}:{inventory_part_id:'',part_number:'',description:'',unit_price:''});};
 function reset(type=kind){setEditing(null);setKind(type);setItems([emptyItem()]);setEquipment({equipment_type:'',make:'',model:'',serial:'',description:'',price:''});setCustomerId('');setCustomerName('');setPayment('CASH');setOverride(false);setError('');}
 function editReceipt(r){if(r.status==='VOID')return;setEditing(r);setKind(r.sale_type);setCustomerId(r.customer_id||'');setCustomerName(r.customer_name||'');setPayment(r.payment_method);setItems((itemsByReceipt[r.id]||[]).map(x=>({inventory_part_id:x.inventory_part_id||'',part_number:x.part_number||'',description:x.description,quantity:x.quantity,unit_price:x.unit_price})));setEquipment({equipment_type:r.equipment_type||'',make:r.equipment_make||'',model:r.equipment_model||'',serial:r.equipment_serial||'',description:r.equipment_description||'',price:r.subtotal});setOverride(false);setError('');window.scrollTo({top:0,behavior:'smooth'});}
 async function save(){
  if(busy)return;
  if(kind==='PARTS'&&(!items.length||items.some(x=>!x.description.trim()||!Number.isInteger(Number(x.quantity))||Number(x.quantity)<=0||x.unit_price===''||!Number.isFinite(Number(x.unit_price))||Number(x.unit_price)<0))){setError('Every part needs a description, whole-number quantity, and valid price.');return;}
  if(kind==='USED_EQUIPMENT'&&(!equipment.equipment_type.trim()||equipment.price===''||!Number.isFinite(Number(equipment.price))||Number(equipment.price)<0)){setError('Equipment type and valid price are required.');return;}
  if(!window.confirm(editing?`Save changes to ${number(editing)}?`:'Complete this fully paid sale and create the receipt?'))return;
  // Open during the button click so browsers don't block the print window
  // after the asynchronous database save.
  const printWindow=editing?null:window.open('','_blank');
  if(printWindow){
   printWindow.document.write('<!doctype html><title>Preparing receipt</title><p>Saving sale and preparing receipt…</p>');
   printWindow.document.close();
  }
  setBusy(true);setError('');
  try{
   const {data,error:e}=await sb.rpc('sales_save',{p_receipt_id:editing?.id||null,p_expected_version:editing?.version||null,p_sale_type:kind,p_customer_id:customerId||null,p_customer_name:customerName||null,p_payment_method:payment,p_items:kind==='PARTS'?items.map(x=>({...x,quantity:Number(x.quantity),unit_price:Number(x.unit_price)})):[],p_equipment:kind==='USED_EQUIPMENT'?equipment:{},p_override_stock:override});
   if(e)throw e;
   // Fetch the committed receipt and lines directly; React state refresh is asynchronous.
   if(!editing){
    const [saved,lines]=await Promise.all([
     sb.from('sales_receipts').select('*').eq('id',data).single(),
     sb.from('sales_receipt_items').select('*').eq('receipt_id',data).order('position')
    ]);
    if(saved.error||lines.error)throw saved.error||lines.error;
    printReceipt(saved.data,printWindow,lines.data||[]);
   }
   await refresh();reset(kind);setMessage(editing?'Receipt updated':'Sale completed — receipt saved and print opened');
   setHistoryKind(kind);setSelected(data);
  }catch(e){
   if(printWindow&&!printWindow.closed)printWindow.close();
   setError(e.message||String(e));
  }finally{setBusy(false);}
 }
 async function voidReceipt(r){const reason=window.prompt(`Void ${number(r)}? Enter the required reason:`);if(reason===null)return;if(!reason.trim()){setError('Void reason is required.');return;}if(!window.confirm(`Confirm VOID ${number(r)}? Inventory will be restored.`))return;setBusy(true);setError('');try{const {error:e}=await sb.rpc('sales_void',{p_receipt_id:r.id,p_reason:reason.trim()});if(e)throw e;await refresh();setMessage(`${number(r)} voided`);}catch(e){setError(e.message||String(e));}finally{setBusy(false);}}
 async function changeTax(){const rate=Number(taxInput);if(!Number.isFinite(rate)||rate<0||rate>100){setError('Tax rate must be between 0 and 100%.');return;}setBusy(true);try{const {error:e}=await sb.rpc('sales_set_tax_rate',{p_rate:rate});if(e)throw e;await refresh();setMessage('Default parts tax rate updated');setError('');}catch(e){setError(e.message||String(e));}finally{setBusy(false);}}
 async function showAudit(r){const {data,error:e}=await sb.from('sales_receipt_audit').select('*').eq('receipt_id',r.id).order('occurred_at',{ascending:false});if(e){setError(e.message);return;}setAuditByReceipt(a=>({...a,[r.id]:data||[]}));}
 function printReceipt(r,existingWindow=null,receiptLines=null){
  const lines=receiptLines||itemsByReceipt[r.id]||[];
  const body=r.sale_type==='PARTS'?`<table><thead><tr><th>Part / Description</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${lines.map(x=>`<tr><td>${esc(x.part_number)} ${esc(x.description)}</td><td>${x.quantity}</td><td>${fmt(x.unit_price)}</td><td>${fmt(x.line_total)}</td></tr>`).join('')}</tbody></table>`:`<p><b>Type:</b> ${esc(r.equipment_type)}<br><b>Make:</b> ${esc(r.equipment_make)}<br><b>Model:</b> ${esc(r.equipment_model)}<br><b>Serial:</b> ${esc(r.equipment_serial)}<br><b>Description:</b> ${esc(r.equipment_description)}</p>`;
  const page=printSize==='Letter'?'letter':printSize==='80mm'?'80mm':'58mm';
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${number(r)}</title><style>@page{size:${page==='letter'?'letter':page} auto;margin:${page==='letter'?'0.5in':'3mm'}}body{font-family:Arial,sans-serif;color:#111;font-size:${page==='letter'?'12px':'10px'};margin:0}img{max-width:${page==='letter'?'190px':'95%'};max-height:95px;object-fit:contain}h2{margin:6px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{padding:5px 2px;border-bottom:1px solid #ccc;overflow-wrap:anywhere;text-align:left}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.tot{text-align:right;margin:12px 0}.terms{margin-top:22px;border-top:1px solid #555;padding-top:12px}.sig{margin-top:35px}.void{font-size:22px;font-weight:bold;border:3px solid #111;text-align:center;padding:8px} @media print{button{display:none}}</style></head><body>${logo?`<img src="${esc(logo)}" alt="JeffCo logo">`:''}<h2>JeffCo Lawn Mower Repair</h2><div>${esc(number(r))} · ${esc(new Date(r.created_at).toLocaleString())}</div>${r.status==='VOID'?'<p class="void">VOID</p>':''}<p>Customer: ${esc(r.customer_name||customers.find(c=>c.id===r.customer_id)?.name||'Walk-in')}<br>Payment: ${esc(r.payment_method)} · PAID</p>${body}<div class="tot">Subtotal: ${fmt(r.subtotal)}<br>${r.sale_type==='PARTS'?`Sales tax (${r.tax_rate}%): ${fmt(r.tax_amount)}<br>`:''}<strong>Total Paid: ${fmt(r.total)}</strong></div>${r.sale_type==='USED_EQUIPMENT'?'<div class="terms"><strong>SOLD AS-IS / NO WARRANTY</strong><p>Buyer acknowledges the used equipment is sold as-is, without warranty.</p><div class="sig">Buyer signature: __________________________<br><br>Date: __________________</div></div>':''}${r.status==='VOID'?`<p>Void reason: ${esc(r.void_reason)}</p>`:''}</body></html>`;
  const w=existingWindow||window.open('','_blank');if(!w){setError('Pop-up blocked. Allow pop-ups to print.');return;}w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{try{w.focus();w.print();}catch{}},650);
 }
 function sizeChanged(x){setPrintSize(x);try{localStorage.setItem('jeffco-sales-print-size',x);}catch{}}
 const selectedReceipt=receipts.find(r=>r.id===selected);
 return <div className="sales-v94">
  <div className="top"><div><h2>Sales & Receipts</h2><p className="muted">Completed, fully paid sales only · separate from repair tickets</p></div><button className="small dark" onClick={()=>{refresh();setMessage('');}}>Refresh</button></div>
  {error&&<div className="alert">{error}</div>}{message&&<div className="notice">{message}</div>}
  <section className="panel"><h3>{editing?`Edit ${number(editing)}`:'New Sale'}</h3><div className="sales-tabs"><button className={kind==='PARTS'?'':'dark'} disabled={!!editing} onClick={()=>reset('PARTS')}>Parts Sale</button><button className={kind==='USED_EQUIPMENT'?'':'dark'} disabled={!!editing} onClick={()=>reset('USED_EQUIPMENT')}>Used Equipment Sale</button></div>
   <div className="sales-grid"><label>Existing customer (optional)<select value={customerId} onChange={e=>{setCustomerId(e.target.value);if(e.target.value)setCustomerName(customers.find(c=>c.id===e.target.value)?.name||'');}}><option value="">Walk-in / unlinked customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Customer name (optional)<input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Walk-in"/></label><label>Payment received<select value={payment} onChange={e=>setPayment(e.target.value)}>{['CASH','CARD','CHECK','OTHER'].map(x=><option key={x}>{x}</option>)}</select></label></div>
   {kind==='PARTS'?<><h4>Parts</h4>{items.map((x,i)=><div className="sales-item" key={i}><label>Inventory part<select value={x.inventory_part_id||''} onChange={e=>choosePart(i,e.target.value)}><option value="">Manual / not linked</option>{catalog.map(p=><option key={p.id} value={p.id}>{p.part_number} — {p.description} (stock {p.quantity_on_hand})</option>)}</select></label><label>Part number<input value={x.part_number} onChange={e=>updateItem(i,{part_number:e.target.value})}/></label><label>Description<input value={x.description} onChange={e=>updateItem(i,{description:e.target.value})}/></label><label>Qty<input type="number" min="1" step="1" value={x.quantity} onChange={e=>updateItem(i,{quantity:e.target.value})}/></label><label>Unit price ($)<input type="number" min="0" step="0.01" value={x.unit_price} onChange={e=>updateItem(i,{unit_price:e.target.value})}/></label><button type="button" className="small danger" onClick={()=>setItems(a=>a.filter((_,j)=>i!==j))}>Remove</button></div>)}<button className="small dark" onClick={()=>setItems(a=>[...a,emptyItem()])}>+ Add Part</button><label className="sales-override"><input type="checkbox" checked={override} onChange={e=>setOverride(e.target.checked)}/> Explicitly allow insufficient stock (may create negative inventory; recorded in audit)</label></>:<div className="sales-grid">{[['equipment_type','Equipment type'],['make','Make'],['model','Model'],['serial','Serial number'],['description','Description'],['price','Selling price ($)']].map(([key,label])=><label key={key}>{label}<input type={key==='price'?'number':'text'} min={key==='price'?0:undefined} step={key==='price'?'0.01':undefined} value={equipment[key]} onChange={e=>setEquipment(a=>({...a,[key]:e.target.value}))}/></label>)}</div>}
   <div className="sales-total">Subtotal: {fmt(subtotal)}{kind==='PARTS'&&<> · Tax ({editing?.tax_rate??settings.parts_tax_rate}%): {fmt(tax)}</>}<strong>Total: {fmt(subtotal+tax)}</strong></div><div className="rowactions"><button disabled={busy} onClick={save}>{busy?'Saving…':editing?'Save Receipt Changes':'Complete Paid Sale'}</button>{editing&&<button className="dark" onClick={()=>reset(kind)}>Cancel Edit</button>}</div>
  </section>
  <section className="panel"><h3>Receipt History</h3><div className="sales-tabs"><button className={historyKind==='PARTS'?'':'dark'} onClick={()=>setHistoryKind('PARTS')}>Parts Sales</button><button className={historyKind==='USED_EQUIPMENT'?'':'dark'} onClick={()=>setHistoryKind('USED_EQUIPMENT')}>Used Equipment Sales</button></div><input className="search" placeholder="Search receipt number, customer, part, or equipment…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="sales-grid"><label>Print format<select value={printSize} onChange={e=>sizeChanged(e.target.value)}>{sizes.map(x=><option key={x}>{x}</option>)}</select></label></div>
   {!visible.length&&<div className="empty">No receipts found.</div>}{visible.map(r=><div className="row" key={r.id}><div><b>{number(r)} · {fmt(r.total)} {r.status==='VOID'?'· VOID':''}</b><small>{new Date(r.created_at).toLocaleString()} · {r.customer_name||customers.find(c=>c.id===r.customer_id)?.name||'Walk-in'} · {r.payment_method}</small><small>{r.sale_type==='PARTS'?(itemsByReceipt[r.id]||[]).map(x=>x.description).join(', '):[r.equipment_make,r.equipment_model,r.equipment_serial].filter(Boolean).join(' · ')}</small></div><div className="rowactions"><button className="small" onClick={()=>printReceipt(r)}>Print</button><button className="small dark" onClick={()=>{setSelected(selected===r.id?null:r.id);showAudit(r);}}>Details / Audit</button>{r.status!=='VOID'&&<><button className="small" onClick={()=>editReceipt(r)}>Edit</button><button className="small danger" disabled={busy} onClick={()=>voidReceipt(r)}>Void</button></>}</div></div>)}
   {selectedReceipt&&<div className="sales-detail"><h4>{number(selectedReceipt)} · {selectedReceipt.status}</h4><p>Subtotal {fmt(selectedReceipt.subtotal)} · Tax {fmt(selectedReceipt.tax_amount)} · Total {fmt(selectedReceipt.total)}</p>{selectedReceipt.void_reason&&<p>Void reason: {selectedReceipt.void_reason}</p>}<h4>Audit history</h4>{(auditByReceipt[selectedReceipt.id]||[]).map(a=><div key={a.id} className="row"><span>{a.event} · {new Date(a.occurred_at).toLocaleString()} · User {a.actor}</span><details><summary>Changes</summary><pre>{JSON.stringify({before:a.before_state,after:a.after_state,details:a.details},null,2)}</pre></details></div>)}</div>}
  </section>
  <section className="panel"><h3>Parts Sales Tax Settings</h3><p className="muted">Default for new parts sales only. Existing receipts retain their original tax rate.</p><div className="sales-grid"><label>Default tax rate (%)<input type="number" min="0" max="100" step="0.0001" value={taxInput} onChange={e=>setTaxInput(e.target.value)}/></label></div><button className="small" disabled={busy} onClick={changeTax}>Save Tax Rate</button></section>
 </div>;
}
