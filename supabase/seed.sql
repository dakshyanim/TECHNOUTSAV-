-- Run after migrations. Fixed IDs make this seed safe to rerun.
-- Preserve existing questions/answers if an organizer has edited them.
insert into public.questions(id, question, category, difficulty, correct_answer, points) values
('10000000-0000-4000-8000-000000000001', 'What does CPU stand for?', 'Computer fundamentals', 'easy', 'Central Processing Unit', 10),
('10000000-0000-4000-8000-000000000002', 'Which data structure follows Last In, First Out? Answer with its name.', 'Data structures', 'easy', 'Stack', 10),
('10000000-0000-4000-8000-000000000003', 'What is the decimal value of binary 1010?', 'Computer fundamentals', 'easy', '10', 10),
('10000000-0000-4000-8000-000000000004', 'Which SQL keyword retrieves rows from a table?', 'Databases', 'easy', 'SELECT', 10),
('10000000-0000-4000-8000-000000000005', 'What does HTTP stand for?', 'Networking', 'medium', 'Hypertext Transfer Protocol', 20),
('10000000-0000-4000-8000-000000000006', 'What is the default HTTPS port? Answer with a number.', 'Networking', 'medium', '443', 20),
('10000000-0000-4000-8000-000000000007', 'In Python, which keyword defines a function?', 'Programming', 'easy', 'def', 10),
('10000000-0000-4000-8000-000000000008', 'Which Git command copies a remote repository? Answer with the full two-word command.', 'Developer tools', 'easy', 'git clone', 10),
('10000000-0000-4000-8000-000000000009', 'What is the worst-case time complexity of binary search on a sorted array? Use notation such as O(n).', 'Algorithms', 'medium', 'O(log n)', 20),
('10000000-0000-4000-8000-000000000010', 'Which ACID property means a transaction is all-or-nothing?', 'Databases', 'hard', 'Atomicity', 30)
on conflict (id) do nothing;

-- Assign readable QR codes when this seed runs after migration 004.
update public.questions q set challenge_code = 'Q' || lpad(n::text, 3, '0')
from generate_series(1,10) n
where q.id = ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
  and q.challenge_code like 'Q-%';

-- Backward-compatible seed conversion when MCQ migration is installed.
do $seed$ begin
if exists(select 1 from information_schema.columns where table_schema='public' and table_name='questions' and column_name='choices') then
update public.questions q set choices=v.options from (values
('10000000-0000-4000-8000-000000000001'::uuid,'What does CPU stand for?', '["Central Processing Unit","Computer Power Unit","Central Program Utility","Control Processing User"]'::jsonb),
('10000000-0000-4000-8000-000000000002'::uuid,'Which data structure follows Last In, First Out? Answer with its name.', '["Queue","Stack","Tree","Graph"]'::jsonb),
('10000000-0000-4000-8000-000000000003'::uuid,'What is the decimal value of binary 1010?', '["8","12","10","14"]'::jsonb),
('10000000-0000-4000-8000-000000000004'::uuid,'Which SQL keyword retrieves rows from a table?', '["INSERT","UPDATE","DELETE","SELECT"]'::jsonb),
('10000000-0000-4000-8000-000000000005'::uuid,'What does HTTP stand for?', '["Hypertext Transfer Protocol","High Transfer Text Process","Hyperlink Transmission Program","Host Text Transfer Package"]'::jsonb),
('10000000-0000-4000-8000-000000000006'::uuid,'What is the default HTTPS port? Answer with a number.', '["80","21","443","8080"]'::jsonb),
('10000000-0000-4000-8000-000000000007'::uuid,'In Python, which keyword defines a function?', '["function","define","func","def"]'::jsonb),
('10000000-0000-4000-8000-000000000008'::uuid,'Which Git command copies a remote repository? Answer with the full two-word command.', '["git init","git clone","git pull","git fetch"]'::jsonb),
('10000000-0000-4000-8000-000000000009'::uuid,'What is the worst-case time complexity of binary search on a sorted array? Use notation such as O(n).', '["O(n)","O(log n)","O(n²)","O(1)"]'::jsonb),
('10000000-0000-4000-8000-000000000010'::uuid,'Which ACID property means a transaction is all-or-nothing?', '["Consistency","Isolation","Durability","Atomicity"]'::jsonb)
) as v(id,original_question,options) where q.id=v.id and q.question=v.original_question and q.choices is null and exists(select 1 from jsonb_array_elements_text(v.options) x where lower(btrim(x))=lower(btrim(q.correct_answer)));
end if;
end; $seed$;
