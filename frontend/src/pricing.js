export const fmtEUR = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n))

// Prix unitaire à afficher : TTC si le pro a saisi en TTC (ou franchise de TVA), sinon HT
export const showTtc = d => d.prix_mode === 'ttc' || d.tva_franchise
export const unitPrice = (l, d) => Number(showTtc(d) && l.prix_unitaire_ttc != null ? l.prix_unitaire_ttc : l.prix_unitaire_ht)
export const lineTotal = (l, d) => Number(l.quantite) * unitPrice(l, d)
