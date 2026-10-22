import { OrbitMark, Waveform, BloomImage, TechnicalDrawing } from "@/components/home/Artwork";

/** Original visual studies identify disciplines. They are artwork for the
 * interface, never presented as an employee-produced deliverable. */
export function StudioStudy({kind="vector",index=0}:{kind?:string;index?:number}) {
  return <div className={`studio-study study-${kind}`} aria-hidden="true">
    <span className="study-index">STUDY / {String(index+1).padStart(2,"0")}</span>
    {kind==="image"||kind==="photo"||kind==="film"?<div className="study-photograph"><BloomImage/></div>:kind==="sound"?<><b className="study-type">a little<br/><em>feeling.</em></b><Waveform/></>:kind==="cad"?<TechnicalDrawing/>:kind==="writing"||kind==="document"?<><div className="study-paper"><b>On the art<br/>of <em>beginning.</em></b><div><i/><i/><i/><i/><i/><i/></div></div><span className="study-serif">Aa</span></>:kind==="interface"||kind==="grid"?<div className="study-grid">{Array.from({length:12},(_,i)=><i key={i}/>)}</div>:kind==="motion"?<><b className="study-motion">MAKE<br/><em>MOVE.</em></b><OrbitMark/></>:kind==="layout"||kind==="slides"?<><div className="study-poster"><span>THE CREATIVE ISSUE</span><b>What<br/><em>comes<br/>next?</em></b></div><OrbitMark/></>:<OrbitMark/>}
    <span className="study-registration">+<span>+</span></span>
  </div>;
}
