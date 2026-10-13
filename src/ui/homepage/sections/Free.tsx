import { sections } from '../copy'
import { Feature } from '../Feature'

const { free } = sections

export function Free() {
  return (
    <Feature id={free.id} heading={free.heading} body={free.body} side="right" art="free">
      <div className="hp-sheet">
        <p className="hp-sheet-title">{free.sheet.title}</p>
        <p className="hp-sheet-line">{free.sheet.line}</p>
        <div className="hp-sheet-lines" aria-hidden="true">{[100, 100, 100, 74, 0, 52, 100, 100, 100, 80, 0, 32, 84, 78, 52, 0, 40, 28].map((width, index) => width ? <span key={index} style={{ width: `${width}%` }} /> : <span key={index} className="hp-gap" />)}</div>
      </div>
    </Feature>
  )
}
