import { Link } from 'react-router-dom'

// Projet de conditions d'utilisation destiné aux professionnels — à faire valider par un juriste avant ouverture publique.
export default function Cgu() {
  return (
    <div className="page"><div className="container" style={{ maxWidth: 720 }}>
      <div className="topbar"><Link to="/" className="logo">Finalise</Link></div>
      <h1 style={{ marginBottom: 16 }}>Conditions d'utilisation (professionnels)</h1>
      <div className="card" style={{ lineHeight: 1.6, fontSize: 15 }}>
        <h3>1. Objet</h3>
        <p>Finalise est un outil qui permet à un professionnel indépendant d'envoyer un devis à son client par lien unique, de recueillir sa signature électronique et d'encaisser le paiement en ligne. Finalise n'est pas partie au contrat entre le professionnel et son client.</p>
        <h3>2. Responsabilité du professionnel</h3>
        <p>Le professionnel est seul responsable du contenu de ses devis, de ses conditions générales de vente (CGV), de ses prix, de sa TVA, de ses obligations d'information et de la réalisation de la prestation. Les conditions d'annulation et de remboursement sont celles de ses CGV ; Finalise n'intervient pas dans leur application.</p>
        <h3>3. Paiement</h3>
        <p>Les paiements sont traités par Stripe, via un compte Stripe Connect ouvert au nom du professionnel, qui accepte les conditions de Stripe. Finalise prélève une commission de 1 % du montant payé par le client. Le professionnel supporte les frais de Stripe, les litiges (contestations de paiement) et les remboursements liés à ses ventes, y compris tout solde négatif de son compte.</p>
        <h3>4. Preuve</h3>
        <p>Pour chaque signature, Finalise conserve une empreinte du contenu signé, la date, l'adresse IP et la version des CGV acceptée, et génère un justificatif et une facture acquittée téléchargeables.</p>
        <h3>5. Données personnelles</h3>
        <p>Pour les données de ses clients, le professionnel est responsable du traitement et Finalise son sous-traitant. Voir la <Link to="/confidentialite">politique de confidentialité</Link>.</p>
        <h3>6. Disponibilité et résiliation</h3>
        <p>Finalise est fourni sans garantie de disponibilité continue. Le professionnel peut cesser d'utiliser le service à tout moment ; les devis signés et les factures émises restent conservés pour leur durée légale.</p>
        <h3>7. Droit applicable</h3>
        <p>Droit français. Tribunaux compétents : ceux du ressort du siège de l'éditeur.</p>
        <p className="form-hint">Éditeur : Joseph Hallépée, 10 rue du 19 Août, 74000 Annecy.</p>
      </div>
    </div></div>
  )
}
