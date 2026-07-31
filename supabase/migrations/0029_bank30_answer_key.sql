-- ---------------------------------------------------------------------------
-- Answer key for "Present Continuous — Beginner (30 random from 50)".
--
-- That hosted test draws a balanced 30 questions from an 80-item bank, so the
-- key covers all 80 and `count` pins the denominator at 30 — the number of
-- questions actually served per attempt.
--
-- The bank is the original 50 plus the 30 questions merged in from the
-- bilingual fixed-set test (html_test 8a6f72d4) on 2026-07-31, converted to
-- bank format. Both tests remain live and now overlap by those 30 items.
--
-- Word-order entries may list more than one accepted sentence: a few of the
-- merged questions have two valid orders ("Are you waiting for the bus" /
-- "You are waiting for the bus"), which the bank format stores as tiles plus
-- an `accept` list. The server must accept both or it would mark a student
-- wrong for an answer the page told them was right.
--
-- Generated from the BANK array in the test file itself.
--
-- Matched on storage_path so the migration is environment-independent: where
-- the test does not exist the insert affects no rows.
-- ---------------------------------------------------------------------------

insert into html_test_answer_keys (html_test_id, answer_key, require_answers)
select h.id, '{"version":1,"count":30,"skill":"GRAMMAR","items":{"31":{"t":"mc","a":["is dancing"]},"32":{"t":"mc","a":["am drinking"]},"33":{"t":"mc","a":["are doing"]},"34":{"t":"mc","a":["isn''t walking"]},"35":{"t":"mc","a":["aren''t eating"]},"36":{"t":"mc","a":["Is"]},"37":{"t":"mc","a":["are"]},"38":{"t":"mc","a":["singing"]},"39":{"t":"mc","a":["taking"]},"40":{"t":"mc","a":["sitting"]},"41":{"t":"mc","a":["staying"]},"42":{"t":"mc","a":["coming"]},"43":{"t":"mc","a":["writing"]},"44":{"t":"mc","a":["am not"]},"45":{"t":"mc","a":["Is"]},"46":{"t":"mc","a":["is"]},"47":{"t":"mc","a":["aren''t"]},"48":{"t":"mc","a":["isn''t going"]},"49":{"t":"mc","a":["Is the plane flying?"]},"50":{"t":"mc","a":["isn''t"]},"51":{"t":"wo","a":["My father is washing the car"]},"52":{"t":"wo","a":["The girls are dancing in the room"]},"53":{"t":"wo","a":["I am taking a photo"]},"54":{"t":"wo","a":["The sun is shining today"]},"55":{"t":"wo","a":["We are having breakfast now"]},"56":{"t":"wo","a":["The dog is not sleeping outside"]},"57":{"t":"wo","a":["They are not coming with us"]},"58":{"t":"wo","a":["Aziza is not using her computer"]},"59":{"t":"wo","a":["I am not writing a message"]},"60":{"t":"wo","a":["The boys are not swimming today"]},"61":{"t":"wo","a":["Is your mother cooking dinner"]},"62":{"t":"wo","a":["Are the students sitting quietly"]},"63":{"t":"wo","a":["Where are you going"]},"64":{"t":"wo","a":["What is Nodir carrying"]},"65":{"t":"wo","a":["Why are they running"]},"66":{"t":"tr","a":["dilnoza is dancing now"]},"67":{"t":"tr","a":["i am opening the window"]},"68":{"t":"tr","a":["the students are learning english","students are learning english"]},"69":{"t":"tr","a":["my father is driving now","my father is driving a car now"]},"70":{"t":"tr","a":["the cat is lying under the table","the cat is laying under the table"]},"71":{"t":"tr","a":["akmal is not reading a newspaper now","akmal is not reading newspaper now"]},"72":{"t":"tr","a":["we are not waiting for the teacher"]},"73":{"t":"tr","a":["my sister is not making a cake","my sister is not baking a cake"]},"74":{"t":"tr","a":["i am not sitting on the floor"]},"75":{"t":"tr","a":["the children are not playing outside","children are not playing outside"]},"76":{"t":"tr","a":["are you writing an email","are you writing an e-mail"]},"77":{"t":"tr","a":["is madina running in the park"]},"78":{"t":"tr","a":["what are the children eating","what are children eating"]},"79":{"t":"tr","a":["why is the teacher smiling"]},"80":{"t":"tr","a":["are we going home now"]},"81":{"t":"mc","a":["am reading"]},"82":{"t":"mc","a":["isn''t watching"]},"83":{"t":"mc","a":["Are"]},"84":{"t":"mc","a":["writing"]},"85":{"t":"mc","a":["are making"]},"86":{"t":"mc","a":["sleeping"]},"87":{"t":"mc","a":["making"]},"88":{"t":"mc","a":["running"]},"89":{"t":"mc","a":["sitting"]},"90":{"t":"mc","a":["lying"]},"91":{"t":"mc","a":["aren''t"]},"92":{"t":"mc","a":["are"]},"93":{"t":"wo","a":["Sara is studying English now"]},"94":{"t":"wo","a":["the children are playing in the park"]},"95":{"t":"wo","a":["Jamshid is wearing a blue shirt"]},"96":{"t":"wo","a":["I am not wearing a jacket"]},"97":{"t":"wo","a":["Malika is not working today"]},"98":{"t":"wo","a":["we are not watching television"]},"99":{"t":"wo","a":["are you waiting for the bus","you are waiting for the bus"]},"100":{"t":"wo","a":["is the teacher speaking now","the teacher is speaking now"]},"101":{"t":"wo","a":["why is the baby crying"]},"102":{"t":"wo","a":["what are they making"]},"103":{"t":"tr","a":["aziza is reading a book now","aziza is reading a book"]},"104":{"t":"tr","a":["jasur is not sleeping now","jasur is not sleeping"]},"105":{"t":"tr","a":["are the children running in the park","are the kids running in the park"]},"106":{"t":"tr","a":["what are you doing now","what are you doing"]},"107":{"t":"tr","a":["i am not waiting for the bus now","i am not waiting for the bus"]},"108":{"t":"tr","a":["ali is sitting on a chair","ali is sitting on the chair"]},"109":{"t":"tr","a":["are they swimming now","are they swimming"]},"110":{"t":"tr","a":["why is the baby crying"]}}}'::jsonb, true
from html_tests h
where h.storage_path like '%present-continuous-bank30.html'
on conflict (html_test_id) do update
  set answer_key      = excluded.answer_key,
      require_answers = excluded.require_answers;
