import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

const schema = a.schema({
  Team: a
    .model({
      name: a.string().required(),
      // 任意項目は .required() を付けないだけでOK（.optional() は不要）
      division: a.string(),
    })
    .authorization((allow) => [
      allow.groups(['Admin']).to(['read','create','update','delete']),
      allow.groups(['Scorer','Viewer']).to(['read']),
    ]),

  Game: a
    .model({
      date: a.date().required(),
      venue: a.string(),             // 任意
      homeTeamID: a.id().required(),
      awayTeamID: a.id().required(),
      q1Home: a.integer(), q1Away: a.integer(),
      q2Home: a.integer(), q2Away: a.integer(),
      q3Home: a.integer(), q3Away: a.integer(),
      q4Home: a.integer(), q4Away: a.integer(),
      otHome: a.integer(),  otAway: a.integer(),
      finalHome: a.integer(),        // 入力しなければ未定義でOK
      finalAway: a.integer(),
      notes: a.string(),
    })
    .authorization((allow) => [
      allow.groups(['Admin','Scorer']).to(['read','create','update','delete']),
      allow.groups(['Viewer']).to(['read']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({ schema });
