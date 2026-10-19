import assert from 'node:assert/strict';
import { isMissingQuestionSchema, QuestionSchemaError } from '../src/lib/question-schema.ts';
for(const [code,message] of [['42703','column questions.choices does not exist'],['42703','column questions.claimed_at does not exist'],['PGRST204',"Could not find the 'choices' column of 'questions' in the schema cache"]]) assert.equal(isMissingQuestionSchema({code,message}),true);
for(const error of [null,{code:'42501',message:'Permission denied'},{code:'',message:'Network unavailable'},{code:'42703',message:'Unknown other column'}]) assert.equal(isMissingQuestionSchema(error),false);
assert.match(new QuestionSchemaError().message,/202610190010_mcq_first_correct.sql/);
console.log('PASS: missing MCQ schema gets upgrade instructions; unrelated database failures are not misidentified.');
