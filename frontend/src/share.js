const fmt = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n))

// Message pré-rédigé : seuls les champs connus sont insérés (jamais de « [nom] » vide).
export function buildMessage(devis, pro, url) {
  const prenom = (devis.client_nom || '').trim().split(/\s+/)[0]
  const na = devis.tva_mode ? devis.tva_mode === 'non_applicable' : Number(devis.tva_pct) === 0
  const lignes = []
  lignes.push(prenom ? `Bonjour ${prenom},` : 'Bonjour,')
  lignes.push('')
  const objet = devis.objet ? `« ${devis.objet} »` : 'votre prestation'
  const quand = devis.date_prestation ? `, ${devis.date_prestation}` : ''
  lignes.push(`Voici votre devis pour ${objet}${quand} : ${fmt(devis.montant_ttc)}${na ? '' : ' TTC'}.`)
  lignes.push('')
  lignes.push('Pour le confirmer, le signer et le régler en ligne :')
  lignes.push(url)
  lignes.push('')
  lignes.push('À très bientôt,')
  const nom = [pro?.prenom, pro?.nom].filter(Boolean).join(' ')
  if (nom) lignes.push(nom)
  if (pro?.telephone) lignes.push(pro.telephone)
  return lignes.join('\n')
}

// Numéro au format international pour wa.me (France par défaut : 06… → 336…)
function intl(tel) {
  if (!tel) return ''
  let d = String(tel).replace(/[^\d+]/g, '')
  if (d.startsWith('+')) return d.slice(1)
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return '33' + d.slice(1)
  return d
}
export const waLink = (tel, texte) => `https://wa.me/${intl(tel)}?text=${encodeURIComponent(texte)}`
export const mailLink = (devis, pro, texte) => {
  const sujet = `Votre devis${devis.objet ? ' — ' + devis.objet : ''}${devis.numero ? ' (' + devis.numero + ')' : ''}`
  return `mailto:${devis.client_email ? encodeURIComponent(devis.client_email) : ''}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(texte)}`
}
