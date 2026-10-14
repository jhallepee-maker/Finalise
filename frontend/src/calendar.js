// Liens « ajouter à l'agenda » : fichier .ics (Apple, Outlook, Google) + lien Google Agenda, pour chaque date du devis.
const d8 = s => s.replace(/-/g, '')
const t6 = s => (s || '00:00').replace(':', '') + '00'
const plus1 = s => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
const esc = s => String(s || '').replace(/[\;,]/g, m => '\\' + m).replace(/\n/g, '\\n')

export function calEvents(devis, proNom) {
  const titre = devis.objet || 'Prestation'
  const details = `${titre}${proNom ? ' — ' + proNom : ''}${devis.numero ? ' (devis ' + devis.numero + ')' : ''}`
  return (devis.dates || []).map(o => {
    const creneau = o.mode === 'creneau' && o.debut && o.fin
    return {
      titre, details, creneau, date: o.date, debut: o.debut, fin: o.fin,
      google: 'https://calendar.google.com/calendar/render?action=TEMPLATE'
        + `&text=${encodeURIComponent(titre)}&details=${encodeURIComponent(details)}`
        + `&dates=${creneau ? `${d8(o.date)}T${t6(o.debut)}/${d8(o.date)}T${t6(o.fin)}` : `${d8(o.date)}/${d8(plus1(o.date))}`}`
        + (creneau ? '&ctz=Europe/Paris' : ''),
    }
  })
}

export function icsHref(devis, proNom) {
  const ev = calEvents(devis, proNom)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Finalise//FR', 'CALSCALE:GREGORIAN']
  ev.forEach((e, i) => {
    lines.push('BEGIN:VEVENT', `UID:${devis.id || devis.numero || 'devis'}-${i}@finalise`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`)
    if (e.creneau) lines.push(`DTSTART;TZID=Europe/Paris:${d8(e.date)}T${t6(e.debut)}`, `DTEND;TZID=Europe/Paris:${d8(e.date)}T${t6(e.fin)}`)
    else lines.push(`DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(plus1(e.date))}`)
    lines.push(`SUMMARY:${esc(e.titre)}`, `DESCRIPTION:${esc(e.details)}`, 'END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'))
}
