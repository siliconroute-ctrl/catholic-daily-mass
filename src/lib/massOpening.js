/**
 * Static content for the opening of Mass, after the Greeting and before
 * the Liturgy of the Word.
 *
 * Fixed, public-domain liturgical text — not sourced from Universalis, not
 * date-dependent.
 *
 * Voice roles:
 *  - "priest" for the invitation, which is proper to the priest alone —
 *    uses the same voice as the Gospel.
 *  - "assembly" for the Confiteor itself, prayed by everyone together —
 *    uses the same voice as the readings.
 */

export const PENITENTIAL_ACT = {
  key: "penitential-act",
  label: "Penitential Act",
  voiceRole: "assembly",
  introVoiceRole: "priest",
  intro:
    "Brethren, let us acknowledge our sins, and so prepare ourselves to " +
    "celebrate the sacred mysteries.",
  text:
    "I confess to almighty God, and to you, my brothers and sisters, that " +
    "I have greatly sinned, through my thoughts and in my words, in what " +
    "I have done, and in what I have failed to do; through my fault, " +
    "through my fault, through my most grievous fault; therefore I ask " +
    "blessed Mary ever-Virgin, all the Angels and Saints, and you, my " +
    "brothers and sisters, to pray for me to the Lord our God.",
};

export const MASS_OPENING_SECTIONS = [PENITENTIAL_ACT];
