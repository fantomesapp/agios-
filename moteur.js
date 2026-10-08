
/*
 * AGIOS — Moteur de préparation des opérations bancaires
 * Cette version analyse le texte CSV fourni par l'utilisateur.
 * Elle ne prétend pas lire le contenu d'un PDF.
 */

function analyserCSV(texte) {
  if (typeof texte !== "string" || !texte.trim()) {
    return {
      succes: false,
      message: "Le fichier CSV est vide ou illisible.",
      operations: [],
      totalFrais: 0
    };
  }

  const lignes = texte
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(ligne => ligne.trim());

  if (lignes.length < 2) {
    return {
      succes: false,
      message: "Le CSV doit contenir une ligne d'en-tête et des opérations.",
      operations: [],
      totalFrais: 0
    };
  }

  function separateurPour(ligne) {
    const choix = [";", ",", "\t"];
    return choix.reduce((meilleur, sep) =>
      ligne.split(sep).length > ligne.split(meilleur).length
        ? sep : meilleur, choix[0]);
  }

  const separateur = separateurPour(lignes[0]);

  function decouperLigne(ligne) {
    const cellules = [];
    let cellule = "";
    let entreGuillemets = false;

    for (let i = 0; i < ligne.length; i++) {
      const caractere = ligne[i];

      if (caractere === '"') {
        if (entreGuillemets && ligne[i + 1] === '"') {
          cellule += '"';
          i++;
        } else {
          entreGuillemets = !entreGuillemets;
        }
      } else if (caractere === separateur && !entreGuillemets) {
        cellules.push(cellule.trim());
        cellule = "";
      } else {
        cellule += caractere;
      }
    }

    cellules.push(cellule.trim());
    return cellules;
  }

  const entetes = decouperLigne(lignes[0]).map(valeur =>
    valeur.toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  );

  const trouverColonne = mots =>
    entetes.findIndex(entete => mots.some(mot => entete.includes(mot)));

  const indexDate = trouverColonne(["date"]);
  const indexLibelle = trouverColonne([
    "libelle", "description", "operation", "intitule", "motif"
  ]);
  const indexMontant = trouverColonne([
    "montant", "debit", "credit", "amount", "somme"
  ]);

  if (indexLibelle === -1 || indexMontant === -1) {
    return {
      succes: false,
      message: "Colonnes non reconnues. Le CSV doit comporter un libellé et un montant.",
      operations: [],
      totalFrais: 0
    };
  }

  function lireMontant(valeur) {
    let propre = valeur.replace(/\s/g, "").replace(/[€]/g, "");

    if (propre.includes(",") && propre.includes(".")) {
      propre = propre.lastIndexOf(",") > propre.lastIndexOf(".")
        ? propre.replace(/\./g, "").replace(",", ".")
        : propre.replace(/,/g, "");
    } else {
      propre = propre.replace(",", ".");
    }

    propre = propre.replace(/[^\d.-]/g, "");
    if (!propre || !Number.isFinite(Number(propre))) return null;
    return Number(propre);
  }

  const operations = [];

  for (let i = 1; i < lignes.length; i++) {
    const cellules = decouperLigne(lignes[i]);
    const libelle = cellules[indexLibelle] || "";
    const montant = lireMontant(cellules[indexMontant] || "");

    if (montant === null || !libelle) continue;

    const libelleNormalise = libelle.toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const motsFrais = [
      "commission d'intervention",
      "commission intervention",
      "frais de rejet",
      "rejet de prelevement",
      "rejet de cheque",
      "frais d'incident",
      "frais bancaire",
      "commission",
      "agios",
      "interets debiteurs",
      "lettre d'information",
      "frais de tenue de compte"
    ];

    const correspondance = motsFrais.some(mot =>
      libelleNormalise.includes(mot)
    );

    operations.push({
      date: indexDate >= 0 ? (cellules[indexDate] || "") : "",
      libelle,
      montant,
      fraisPotentiel: correspondance && montant < 0
        ? Math.abs(montant)
        : 0,
      aVerifier: correspondance && montant < 0
    });
  }

  const totalFrais = Number(
    operations.reduce((total, operation) =>
      total + operation.fraisPotentiel, 0).toFixed(2)
  );

  return {
    succes: true,
    message: "Analyse préliminaire : chaque frais détecté doit être vérifié sur le relevé original.",
    operations,
    totalFrais,
    avertissement: "Cette détection par mots-clés peut manquer des frais ou classer certaines opérations à tort. Elle ne détermine pas si un frais est illégal."
  };
}
