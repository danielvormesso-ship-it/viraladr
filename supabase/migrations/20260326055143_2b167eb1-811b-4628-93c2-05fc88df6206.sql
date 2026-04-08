DELETE FROM tiktok_videos 
WHERE lower(author) LIKE '%tiktokbrasil%' 
   OR lower(author) LIKE '%tiktoklatin%'
   OR lower(title) LIKE '%animação%' 
   OR lower(title) LIKE '%animacao%'
   OR lower(title) LIKE '%cartoon%' 
   OR lower(title) LIKE '%desenho%' 
   OR lower(title) LIKE '%vovó%' 
   OR lower(title) LIKE '%vovo%' 
   OR lower(title) LIKE '%personagem%' 
   OR lower(title) LIKE '%anime%' 
   OR lower(title) LIKE '%mascote%'
   OR lower(title) LIKE '%animated%'
   OR lower(title) LIKE '%animation%';