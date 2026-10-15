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
        <p>Le professionnel, Finalise (hébergement : Railway, Vercel), Stripe (paiement) et, le cas échéant, un prestataire d'envoi d'emails. Certains de ces prestataires peuvent traiter des données hors de l'Union européenne, uniquement avec les garanties prévues par le RGPD : décision d'adéquation (cadre de protection des données UE–États-Unis, pour les prestataires qui y adhèrent) ou clauses contractuelles types de la Commission européenne.</p>
        <h3>Données du professionnel et notifications</h3>
        <p>Pour le compte du professionnel (identité, coordonnées, SIRET), Finalise est responsable du traitement. Si le professionnel active les notifications sur son appareil, un identifiant technique d'abonnement est conservé jusqu'à sa désactivation ; aucune notification n'est envoyée sans son accord explicite dans le navigateur ou l'application. Finalise n'utilise aucun traceur publicitaire ni de mesure d'audience.</p>
        <h3>Assurance annulation (facultative)</h3>
        <p>Si le professionnel vous propose une assurance annulation et que vous répondez « oui », vos nom, email, téléphone, adresse éventuelle, la date et le montant de la prestation sont transmis à <strong>Meetch</strong>, l'assureur partenaire, pour établir votre contrat et traiter une éventuelle demande de remboursement. Meetch les traite selon sa propre politique de confidentialité. Si vous répondez « non », aucune donnée ne lui est transmise.</p>
        <h3>Vos droits</h3>
        <p>Accès, rectification, effacement (dans la limite des obligations de conservation), opposition, limitation, portabilité : écrivez au professionnel indiqué sur votre devis. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
      </div>
    </div></div>
  )
}
