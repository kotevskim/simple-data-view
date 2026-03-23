select 
  id, 
  TO_CHAR(date, 'Mon dd, yyyy') date, 
  amount, 
  recipient_display as recipient,
  '<a href="https://www.mozilla.org/en-US/">The Mozilla homepage</a>' as link_html
from payments order by date desc;