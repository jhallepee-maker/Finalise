import { Link } from 'react-router-dom'

// Texte type à faire valider par un juriste avant la mise en production.
export default function Confidentialite() {
  return (
    <div className="page"><div className="container" style={{ maxWidth: 720 }}>
      <div className="topbar"><Link to="/" className="logo">Finalise</Link></div>
      <h1 style={{ marginBottom: 16 }}>Politique de confidentialité</h1>
      <div className="card legal-text" style={{ lineHeight: 1.6, fontSize: 15 }}>
        <h3>Qui traite vos données ?</h3>
        <p>Le professionnel qui vous a envoyé le devis (guide, moniteur, artisan…) est <strong>responsable du traitement</strong> de vos données. Finalise est son <strong>sous-traitant technique</strong> : la plateforme héberge le devis, recueille votre signature et transmet votre paiement.</p>
        <h3>Quelles données ?</h3>
        <p>Nom, email, téléphone, adresse de facturation, nombre de participants, dates confirmées ; adresse IP, navigateur, date et heure de la signature (preuve de signature électronique). Vos coordonnées bancaires sont saisies chez Stripe et ne sont jamais stockées par Finalise ni par le professionnel.</p>
        <h3>Pourquoi ?</h3>
        <p>Exécuter la prestation commandée, établir la facture, conserver la preuve de votre accord, et respecter les obligations comptables. Base légale : exécution du contrat et obligation légale. Aucune publicité, aucune revente.</p>
        <h3>Combien de temps ?</h3>
        <p>Les devis, factures et preuves de signature sont conservés 10 ans (obligations comptables et preuve), puis supprimés.</p>
        <h3>Qui y a accès ?</h3>
        <p>Le professionnel, Finalise (hébergement : Railway, Vercel), Stripe (paiement) et, le cas échéant, un prestataire d'envoi d'emails. Certains de ces prestataires peuvent traiter des données hors de l'Union européenne, avec les garanties prévues par le RGPD.</p>
        <h3>Vos droits</h3>
        <p>Accès, rectification, effacement (dans la limite des obligations de conservation), opposition, limitation, portabilité : écrivez au professionnel indiqué sur votre devis. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
      </div>
    </div></div>
  )
}
