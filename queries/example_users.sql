select 
  id as id_nofilter, 
  TO_CHAR(date, 'Mon dd, yyyy') date, 
  TO_CHAR(date, 'YYYY-MM-DD') AS date_sortval,
  amount * -1 as amount, 
  recipient_display as recipient,
  '<a href="https://www.mozilla.org/en-US/">The Mozilla homepage</a>' as link_html_nosort_nofilter
from payments order by date desc;