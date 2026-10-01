/**
 * Card de contato arrastável no Kanban.
 * Clique abre a área interna; X remove; grip arrasta.
 */
import { IconGrip, IconX } from '@/shared/icons'
import type { Contato } from '@/shared/types/crm'
import { useCrm } from '../store/crmStore'
import { formatBRL, parseValor } from '../views/viewUtils'

type Props = { contato: Contato }

export function ContactCard({ contato }: Props) {
  const { removerContato, abrirContato } = useCrm()
  const valorNum = parseValor(contato.valorOportunidade)

  return (
    <div
      className="contact-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/contato-id', contato.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => abrirContato(contato.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') abrirContato(contato.id)
      }}
    >
      <span className="grip" onClick={(e) => e.stopPropagation()}>
        <IconGrip />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="nome">{contato.nome}</p>
        {contato.tags && contato.tags.length > 0 ? (
          <div className="contact-card-tags">
            {contato.tags.map((tag) => (
              <span key={tag} className="contact-card-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {valorNum > 0 ? (
          <p className="meta" style={{ fontWeight: 600, color: '#047857' }}>
            {formatBRL(valorNum)}
          </p>
        ) : null}
        {contato.email ? <p className="meta">{contato.email}</p> : null}
        {contato.telefone ? (
          <p className="meta">
            {contato.ddi} {contato.telefone}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="remove"
        aria-label="Remover contato"
        onClick={(e) => {
          e.stopPropagation()
          removerContato(contato.id)
        }}
      >
        <IconX />
      </button>
    </div>
  )
}
