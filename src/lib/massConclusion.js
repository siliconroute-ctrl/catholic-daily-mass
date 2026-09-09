/**
 * Static content for the conclusion of Mass, after the Gospel.
 *
 * These are fixed, public-domain, centuries-old prayers — not sourced from
 * Universalis, and not date-dependent, unlike the daily readings.
 *
 * Deliberately NOT included, and why:
 *  - Homily: personal to each priest/parish; nothing generic to offer.
 *  - Prayer of the Faithful: intentions vary daily by parish; no fixed text.
 *  - The Eucharistic Prayer / Consecration: this can only be validly
 *    offered by an ordained priest at an actual Mass. Reciting the words
 *    of consecration outside of that is something the Church takes
 *    seriously and asks be avoided — the same guidance given to actors in
 *    films. This app is a companion for following the readings and
 *    praying at home, not a celebration of Mass, and does not include or
 *    approximate this part.
 *
 * In its place, at the point in Mass where Communion would occur, this
 * includes the traditional Act of Spiritual Communion — the Church's own
 * long-established practice for anyone unable to receive the Eucharist in
 * person.
 *
 * Voice roles:
 *  - "assembly": prayed by everyone together (Creed, Spiritual Communion,
 *    Lord's Prayer) — uses the general/female voice, same as the readings.
 *  - "priest": proper to the priest alone (the final blessing, dismissal)
 *    — uses the same voice as the Gospel.
 */

export const PROFESSION_OF_FAITH = {
  key: "creed",
  label: "Profession of Faith",
  voiceRole: "assembly",
  intro: "",
  text:
    "I believe in God, the Father almighty, Creator of heaven and earth, " +
    "and in Jesus Christ, his only Son, our Lord, who was conceived by the " +
    "Holy Spirit, born of the Virgin Mary, suffered under Pontius Pilate, " +
    "was crucified, died and was buried; he descended into hell; on the " +
    "third day he rose again from the dead; he ascended into heaven, and " +
    "is seated at the right hand of God the Father almighty; from there " +
    "he will come to judge the living and the dead. I believe in the Holy " +
    "Spirit, the holy catholic Church, the communion of saints, the " +
    "forgiveness of sins, the resurrection of the body, and life " +
    "everlasting. Amen.",
};

export const SPIRITUAL_COMMUNION = {
  key: "spiritual-communion",
  label: "Act of Spiritual Communion",
  voiceRole: "assembly",
  intro:
    "As we are not present at Mass to receive Holy Communion, let us make " +
    "an act of Spiritual Communion.",
  text:
    "My Jesus, I believe that You are present in the Most Holy Sacrament. " +
    "I love You above all things, and I desire to receive You into my " +
    "soul. Since I cannot at this moment receive You sacramentally, come " +
    "at least spiritually into my heart. I embrace You as if You were " +
    "already there, and unite myself wholly to You. Never permit me to be " +
    "separated from You. Amen.",
};

export const LORDS_PRAYER = {
  key: "lords-prayer",
  label: "The Lord's Prayer",
  voiceRole: "assembly",
  intro:
    "At the Savior's command, and formed by divine teaching, we dare to say.",
  text:
    "Our Father, who art in heaven, hallowed be thy name; thy kingdom " +
    "come; thy will be done on earth as it is in heaven. Give us this day " +
    "our daily bread; and forgive us our trespasses, as we forgive those " +
    "who trespass against us; and lead us not into temptation, but " +
    "deliver us from evil. Amen.",
};

export const CONCLUDING_RITE = {
  key: "concluding-rite",
  label: "Concluding Rite",
  voiceRole: "priest",
  intro: "",
  text:
    "May almighty God bless you: the Father, and the Son, and the Holy " +
    "Spirit. Go in peace, glorifying the Lord by your life.",
};

export const MASS_CONCLUSION_SECTIONS = [
  PROFESSION_OF_FAITH,
  SPIRITUAL_COMMUNION,
  LORDS_PRAYER,
  CONCLUDING_RITE,
];
