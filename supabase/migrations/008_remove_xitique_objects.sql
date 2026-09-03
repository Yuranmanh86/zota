-- ZORA - remover estruturas antigas de Xitique que já não são utilizadas

drop view if exists public.xitique_participants cascade;
drop table if exists public.xitique_members cascade;
drop table if exists public.xitique_groups cascade;