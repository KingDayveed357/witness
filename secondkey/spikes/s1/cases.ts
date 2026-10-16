// S1 evaluation set (Second Key feasibility sprint, 2026-10-16). ORIGINAL SYNTHETIC conversations,
// written from publicly documented scam typologies (FTC, FBI IC3, AARP descriptions of family-emergency,
// tech-support, romance, government-impersonation, safe-account, investment and payment-channel scams).
// No published text is copied. Names, numbers and organisations are fictional.
//
// Each case has a ground-truth label, the tactics a careful human reviewer would name, and the key
// quotes (verbatim substrings of a line) that show them. Benign cases are deliberately hard look-alikes.
// split: "dev" cases may inform one prompt revision; "holdout" cases are never used for tuning.

export type Tactic =
  | "urgency"
  | "secrecy"
  | "impersonation"
  | "authority_pressure"
  | "unusual_payment_channel"
  | "safe_account"
  | "too_good_to_be_true"
  | "emotional_manipulation"
  | "remote_access"
  | "threat";

export interface Line {
  speaker: string;
  text: string;
}
export interface Case {
  id: string;
  category: string;
  label: "scam" | "benign";
  split: "dev" | "holdout";
  context: string; // who the user is / what they are about to do
  lines: Line[];
  tactics: Tactic[];
  key_quotes: string[]; // verbatim substrings of some line's text
}

const c = (id: string, category: string, label: Case["label"], split: Case["split"], context: string, lines: [string, string][], tactics: Tactic[], key_quotes: string[]): Case => ({
  id,
  category,
  label,
  split,
  context,
  lines: lines.map(([speaker, text]) => ({ speaker, text })),
  tactics,
  key_quotes,
});

export const CASES: Case[] = [
  // ---- family emergency / impersonation (6) ----------------------------------------------------
  c("fam-01", "family_emergency", "scam", "dev", "Rose, 78, is asked to send $1,800.", [
    ["Caller", "Grandma? It's me, Danny. I'm in real trouble, I got arrested after a car accident."],
    ["Rose", "Danny? You sound different."],
    ["Caller", "My nose is broken, that's why. Please, I need $1,800 for bail right now or they keep me overnight."],
    ["Caller", "And please don't tell Mom, she'll kill me. Promise you won't tell her."],
  ], ["impersonation", "urgency", "secrecy", "emotional_manipulation"], ["I need $1,800 for bail right now", "don't tell Mom", "My nose is broken, that's why"]),
  c("fam-02", "family_emergency", "scam", "dev", "Walter gets a text from an unknown number.", [
    ["Unknown number", "Hi Dad, this is my new number, my phone fell in the sink. Save this one."],
    ["Walter", "Oh hi love, everything ok?"],
    ["Unknown number", "Not really, I have to pay a supplier invoice today and my banking app is locked on the new phone. Can you send £940 to this account and I'll pay you back tomorrow?"],
    ["Unknown number", "It has to go before 3pm. Sort code 40-11-22, account 51129834."],
  ], ["impersonation", "urgency"], ["this is my new number", "It has to go before 3pm", "my banking app is locked on the new phone"]),
  c("fam-03", "family_emergency", "scam", "holdout", "Maria receives a call about her son.", [
    ["Caller", "Is this Maria? I'm Officer Grant. Your son was in an accident and he's being held because the other driver was pregnant."],
    ["Caller", "His public defender, Mr. Hale, will call you. The bond is $6,000 and it must be paid today."],
    ["Caller", "There is a gag order on the case, so you cannot discuss it with anyone, even family."],
    ["Caller", "A courier can collect the cash from your house within the hour."],
  ], ["impersonation", "authority_pressure", "urgency", "secrecy", "unusual_payment_channel"], ["it must be paid today", "you cannot discuss it with anyone, even family", "A courier can collect the cash"]),
  c("fam-04", "family_emergency", "scam", "dev", "Linda's phone shows a call from a private number.", [
    ["Caller", "Mom! Mom, help me—"],
    ["Second voice", "We have your daughter. If you call the police she gets hurt."],
    ["Second voice", "Send $3,000 by wire in the next 30 minutes and stay on the line the whole time."],
  ], ["impersonation", "threat", "urgency", "secrecy", "emotional_manipulation"], ["If you call the police she gets hurt", "in the next 30 minutes", "stay on the line the whole time"]),
  c("fam-05", "family_emergency", "scam", "holdout", "George gets messages from someone claiming to be his granddaughter abroad.", [
    ["Granddaughter?", "Grandpa it's Emma, I'm in Lisbon and my bag got stolen with my passport and cards."],
    ["Granddaughter?", "The hostel will throw me out tonight. Could you buy $500 of Apple gift cards and send me the codes? It's the only thing that works here."],
    ["Granddaughter?", "Please keep it between us, I don't want Mum to panic."],
  ], ["impersonation", "urgency", "unusual_payment_channel", "secrecy"], ["buy $500 of Apple gift cards and send me the codes", "keep it between us", "The hostel will throw me out tonight"]),
  c("fam-06", "family_emergency", "scam", "dev", "Helen is called by a man claiming to be a hospital administrator.", [
    ["Caller", "Mrs. Park, your husband was brought in after a fall. He needs surgery but his insurance isn't showing in our system."],
    ["Caller", "We need a $2,400 deposit before the surgeon can start. I can take it by PayPal Friends and Family right now."],
    ["Caller", "Every minute matters, please don't hang up to call anyone."],
  ], ["impersonation", "urgency", "unusual_payment_channel", "emotional_manipulation"], ["I can take it by PayPal Friends and Family right now", "please don't hang up to call anyone", "Every minute matters"]),

  // ---- tech support (5) -----------------------------------------------------------------------
  c("tech-01", "tech_support", "scam", "dev", "Frank called a number shown in a browser pop-up.", [
    ["Agent", "This is Microsoft Windows Defender support. Your computer has been infected with a banking trojan."],
    ["Agent", "Please install AnyDesk so I can remove it before the hackers empty your accounts."],
    ["Agent", "The security license costs $399. We accept Google Play cards because they are untraceable for the hackers."],
  ], ["impersonation", "remote_access", "threat", "unusual_payment_channel"], ["install AnyDesk", "before the hackers empty your accounts", "We accept Google Play cards"]),
  c("tech-02", "tech_support", "scam", "dev", "Joan is on a call about a subscription refund.", [
    ["Agent", "We're refunding your $199 antivirus renewal. Please log in to your bank so I can process it through our secure tool."],
    ["Agent", "Oh no, my colleague typed $1,999 instead of $199 by mistake! You've been refunded too much."],
    ["Agent", "I could lose my job. Please send back the $1,800 difference in Target gift cards today."],
  ], ["impersonation", "remote_access", "emotional_manipulation", "unusual_payment_channel", "urgency"], ["typed $1,999 instead of $199 by mistake", "I could lose my job", "send back the $1,800 difference in Target gift cards today"]),
  c("tech-03", "tech_support", "scam", "holdout", "Ray received an email invoice and called the number in it.", [
    ["Email", "Geek Patrol Total Protection auto-renewal: $449.99 will be charged today. Call to cancel."],
    ["Agent", "To cancel, I need to connect to your computer and verify your bank account."],
    ["Agent", "You must stay on the phone and not tell your bank, or the cancellation will fail."],
  ], ["impersonation", "remote_access", "secrecy", "urgency"], ["I need to connect to your computer", "not tell your bank", "will be charged today"]),
  c("tech-04", "tech_support", "scam", "dev", "Sue gets a text saying her Apple ID is locked.", [
    ["Text", "Apple Support: Your Apple ID has been locked due to suspicious purchases. Call 1-800-555-0144 within 2 hours to avoid permanent deletion."],
    ["Agent", "To unlock it I need the verification code we just sent you, and a payment of $150 in Bitcoin to reinstate the account."],
  ], ["impersonation", "urgency", "threat", "unusual_payment_channel"], ["within 2 hours to avoid permanent deletion", "a payment of $150 in Bitcoin", "I need the verification code we just sent you"]),
  c("tech-05", "tech_support", "scam", "holdout", "Paul is called by someone from 'his bank's IT team'.", [
    ["Caller", "We detected malware on your online banking. I'll guide you to install our TeamViewer security patch."],
    ["Caller", "While it runs, don't use your phone or call the branch, it will corrupt the fix."],
  ], ["impersonation", "remote_access", "secrecy"], ["install our TeamViewer security patch", "don't use your phone or call the branch"]),

  // ---- romance (5) ----------------------------------------------------------------------------
  c("rom-01", "romance", "scam", "dev", "Carol has messaged 'Mark' daily for three months; they have never met.", [
    ["Mark", "My love, I'm finally coming home from the base in Syria. Customs is holding my gold bars and needs a $2,800 release fee."],
    ["Mark", "I can't access my accounts from here. You are the only one I trust."],
    ["Mark", "Don't tell your sister about us yet, she won't understand."],
  ], ["emotional_manipulation", "secrecy", "too_good_to_be_true"], ["Customs is holding my gold bars", "You are the only one I trust", "Don't tell your sister about us"]),
  c("rom-02", "romance", "scam", "dev", "Diane met 'James', an engineer on an oil rig, on a dating app.", [
    ["James", "The rig's payroll system failed and I can't pay the crew's food supplier. I'll repay you double when I'm back next month."],
    ["James", "Please send $1,200 through Western Union to my agent. Hurry, the boat leaves tonight."],
  ], ["emotional_manipulation", "urgency", "unusual_payment_channel", "too_good_to_be_true"], ["I'll repay you double", "send $1,200 through Western Union to my agent", "the boat leaves tonight"]),
  c("rom-03", "romance", "scam", "holdout", "Tom has been chatting with 'Lina' who introduced him to crypto.", [
    ["Lina", "My uncle's trading platform made me 40% this month. I'll show you, just deposit $5,000 to start."],
    ["Lina", "Withdrawals need a 15% unlock tax first, that's normal for big profits."],
  ], ["too_good_to_be_true", "emotional_manipulation", "unusual_payment_channel"], ["made me 40% this month", "Withdrawals need a 15% unlock tax first"]),
  c("rom-04", "romance", "scam", "dev", "Ann's online partner 'Ben' says his daughter is sick.", [
    ["Ben", "Sophie needs medicine the clinic won't release without payment and my card was blocked abroad."],
    ["Ben", "Please send $900 by PayPal Friends and Family, there are no fees that way. I'm begging you, you're all I have."],
  ], ["emotional_manipulation", "unusual_payment_channel"], ["send $900 by PayPal Friends and Family", "you're all I have"]),
  c("rom-05", "romance", "scam", "holdout", "Greg's match 'Elena' wants to visit him.", [
    ["Elena", "I booked the flight to see you but the airline needs proof I have $3,000 or they won't let me board."],
    ["Elena", "Send it to my cousin's account and I'll return it the moment I land. Our dream is so close!"],
  ], ["emotional_manipulation", "too_good_to_be_true"], ["the airline needs proof I have $3,000", "Send it to my cousin's account"]),

  // ---- government / authority impersonation (5) -------------------------------------------------
  c("gov-01", "government", "scam", "dev", "Ed receives a call from 'the IRS'.", [
    ["Caller", "This is Agent Collins, IRS criminal division. You owe $4,312 in back taxes and a warrant has been issued for your arrest."],
    ["Caller", "Officers will arrive in two hours unless you settle now with prepaid Visa cards."],
  ], ["impersonation", "authority_pressure", "threat", "urgency", "unusual_payment_channel"], ["a warrant has been issued for your arrest", "Officers will arrive in two hours", "settle now with prepaid Visa cards"]),
  c("gov-02", "government", "scam", "holdout", "Nina gets a robocall about her Social Security number.", [
    ["Recording", "Your Social Security number has been suspended due to suspicious activity in Texas. Press 1 to speak to an officer."],
    ["Officer", "To protect your benefits, withdraw your savings and buy Bitcoin at the ATM at the gas station. I'll stay on the line."],
  ], ["impersonation", "threat", "unusual_payment_channel", "safe_account"], ["Your Social Security number has been suspended", "buy Bitcoin at the ATM at the gas station"]),
  c("gov-03", "government", "scam", "dev", "Sam is told he missed jury duty.", [
    ["Caller", "Sheriff's office. You missed federal jury duty and there's a $1,500 fine. Pay with gift cards within the hour to avoid being booked."],
    ["Caller", "Do not hang up and do not discuss this, it's a sealed matter."],
  ], ["impersonation", "authority_pressure", "threat", "urgency", "secrecy", "unusual_payment_channel"], ["Pay with gift cards within the hour", "do not discuss this, it's a sealed matter"]),
  c("gov-04", "government", "scam", "dev", "Kate receives a text about a parcel.", [
    ["Text", "National Post: your parcel is held at customs. Pay the $2.99 redelivery fee within 24h at natpost-delivery-help.com or it will be returned."],
  ], ["impersonation", "urgency"], ["Pay the $2.99 redelivery fee within 24h", "natpost-delivery-help.com"]),
  c("gov-05", "government", "scam", "holdout", "Arjun gets a call from 'immigration'.", [
    ["Caller", "Immigration services. There's an error in your visa file and you face deportation unless you pay a $2,000 correction fee today."],
    ["Caller", "Pay by cryptocurrency so it's processed instantly. Don't contact a lawyer, that will delay your case."],
  ], ["impersonation", "threat", "urgency", "unusual_payment_channel", "secrecy"], ["you face deportation unless you pay", "Pay by cryptocurrency", "Don't contact a lawyer"]),

  // ---- safe account (5) -----------------------------------------------------------------------
  c("safe-01", "safe_account", "scam", "dev", "Beth gets a call from 'her bank's fraud team'.", [
    ["Caller", "This is the fraud team at Northstar Bank. A criminal has access to your account and staff at your branch are involved."],
    ["Caller", "Move your $18,000 to a new safe account we've opened for you. Don't tell the branch, they may be part of it."],
  ], ["impersonation", "safe_account", "secrecy", "threat"], ["Move your $18,000 to a new safe account", "Don't tell the branch"]),
  c("safe-02", "safe_account", "scam", "holdout", "Larry is called by an 'FTC agent'.", [
    ["Caller", "I'm with the Federal Trade Commission. Your identity was used in a fraud ring, so your bank accounts will be frozen tomorrow."],
    ["Caller", "Withdraw the money in cash and hand it to our agent for safekeeping. You'll get it back after the investigation."],
  ], ["impersonation", "safe_account", "authority_pressure", "threat", "unusual_payment_channel"], ["hand it to our agent for safekeeping", "your bank accounts will be frozen tomorrow"]),
  c("safe-03", "safe_account", "scam", "dev", "Rita gets a call from 'Amazon security'.", [
    ["Caller", "Amazon security here. Someone ordered a $1,299 iPhone with your account and it's linked to your bank."],
    ["Caller", "To secure your funds, transfer them to the protected account I'll give you, then we'll reverse the order."],
  ], ["impersonation", "safe_account", "threat"], ["transfer them to the protected account I'll give you"]),
  c("safe-04", "safe_account", "scam", "holdout", "Ken is told his savings are at risk.", [
    ["Caller", "Your accounts have been flagged for money laundering. To prove your innocence you must move everything into this verified government wallet."],
    ["Caller", "If you tell anyone, the investigation is compromised and you'll be charged."],
  ], ["impersonation", "safe_account", "threat", "secrecy", "authority_pressure"], ["move everything into this verified government wallet", "If you tell anyone"]),
  c("safe-05", "safe_account", "scam", "dev", "Joy gets a text and then a call.", [
    ["Text", "BankOne: Did you attempt a $2,450 payment to K. Morris? Reply YES or NO."],
    ["Caller", "Thanks for replying NO. To stop it, I need you to send the same amount to the holding account I'll read out, it bounces back in an hour."],
  ], ["impersonation", "safe_account"], ["send the same amount to the holding account", "it bounces back in an hour"]),

  // ---- investment (5) -------------------------------------------------------------------------
  c("inv-01", "investment", "scam", "dev", "Victor joined a WhatsApp investing group.", [
    ["Mentor", "Our AI trading bot returns 3% daily, guaranteed. Members made $40,000 last month."],
    ["Mentor", "Only 5 spots left in the VIP tier, deposit $10,000 in USDT today to lock your place."],
  ], ["too_good_to_be_true", "urgency", "unusual_payment_channel"], ["returns 3% daily, guaranteed", "Only 5 spots left", "deposit $10,000 in USDT today"]),
  c("inv-02", "investment", "scam", "holdout", "Irene is offered pre-IPO shares.", [
    ["Broker", "I can get you pre-IPO shares in a company listing next week at a fraction of the price. Returns of 500% are expected."],
    ["Broker", "This is confidential insider allocation, so please don't mention it to your financial adviser."],
  ], ["too_good_to_be_true", "secrecy"], ["Returns of 500% are expected", "don't mention it to your financial adviser"]),
  c("inv-03", "investment", "scam", "dev", "Hank lost money to a crypto scam last year and is contacted again.", [
    ["Recovery agent", "We're a licensed recovery firm. We traced your stolen $22,000 and can return it."],
    ["Recovery agent", "You only need to pay a $1,950 release fee upfront in Bitcoin to the court escrow."],
  ], ["impersonation", "too_good_to_be_true", "unusual_payment_channel"], ["We traced your stolen $22,000", "pay a $1,950 release fee upfront in Bitcoin"]),
  c("inv-04", "investment", "scam", "dev", "Olga sees a token promoted in a Telegram channel.", [
    ["Admin", "$MOON is about to 50x after the exchange listing tomorrow. Buy now before the pump, it's risk-free."],
    ["Admin", "Send ETH to this wallet and we'll airdrop your tokens."],
  ], ["too_good_to_be_true", "urgency", "unusual_payment_channel"], ["about to 50x", "it's risk-free", "Send ETH to this wallet"]),
  c("inv-05", "investment", "scam", "holdout", "Dev is pitched a forex 'mentorship'.", [
    ["Coach", "I turn $1,000 into $10,000 in a month for my students, no risk because I hedge everything."],
    ["Coach", "Send the mentorship fee by Zelle tonight, the price doubles tomorrow."],
  ], ["too_good_to_be_true", "urgency"], ["no risk because I hedge everything", "the price doubles tomorrow"]),

  // ---- other payment-channel manipulation (5) -------------------------------------------------
  c("pay-01", "payment_channel", "scam", "dev", "Lucy is selling a couch online.", [
    ["Buyer", "I'll pay $200 more than your price, my mover will pick it up. I sent a cheque for $1,450."],
    ["Buyer", "Please send the extra $1,000 to my mover by PayPal Friends and Family before the cheque clears."],
  ], ["too_good_to_be_true", "unusual_payment_channel", "urgency"], ["send the extra $1,000 to my mover", "before the cheque clears"]),
  c("pay-02", "payment_channel", "scam", "holdout", "Ivan is buying concert tickets from a stranger.", [
    ["Seller", "I'll send the tickets right after payment. Pay by PayPal Friends and Family so we both avoid fees."],
    ["Seller", "Lots of people want them, I need payment in 10 minutes."],
  ], ["unusual_payment_channel", "urgency"], ["Pay by PayPal Friends and Family so we both avoid fees", "I need payment in 10 minutes"]),
  c("pay-03", "payment_channel", "scam", "dev", "Mia applied for a remote job.", [
    ["Recruiter", "Congratulations, you're hired as a remote assistant! Before your first paycheck, buy your work laptop from our approved vendor for $850."],
    ["Recruiter", "We'll reimburse you in your first salary. Payment only by Cash App."],
  ], ["too_good_to_be_true", "unusual_payment_channel"], ["buy your work laptop from our approved vendor for $850", "Payment only by Cash App"]),
  c("pay-04", "payment_channel", "scam", "dev", "Bob is told he won a lottery he never entered.", [
    ["Caller", "You've won $750,000 in the International Sweepstakes! To release it you just pay the $3,500 tax and handling fee."],
    ["Caller", "Keep this confidential until the money arrives, to avoid fraud."],
  ], ["too_good_to_be_true", "secrecy"], ["You've won $750,000", "pay the $3,500 tax and handling fee", "Keep this confidential"]),
  c("pay-05", "payment_channel", "scam", "holdout", "A small café owner gets a call from 'the electric company'.", [
    ["Caller", "City Power here. Your account is past due and a crew will disconnect you in 45 minutes during your lunch rush."],
    ["Caller", "To stop it, pay $680 now with a prepaid card and read me the numbers."],
  ], ["impersonation", "threat", "urgency", "unusual_payment_channel"], ["disconnect you in 45 minutes", "pay $680 now with a prepaid card"]),

  // ---- BENIGN look-alikes (24) --------------------------------------------------------------------
  c("ben-01", "benign_family_emergency", "benign", "dev", "Rose's daughter calls from her usual saved number.", [
    ["Daughter (saved contact)", "Mom, it's Claire. Tom fell off the ladder and we're at St. Mary's ER, he's okay but needs stitches."],
    ["Daughter (saved contact)", "Can you pick up the kids from school at 3? No need for money, just help. Call Tom's phone if you can't reach me."],
  ], [], []),
  c("ben-02", "benign_family_emergency", "benign", "dev", "Paul's son calls on video.", [
    ["Son (video call)", "Dad, my car broke down on the highway, it's being towed. The garage wants a $400 deposit."],
    ["Son (video call)", "I'll send you the garage's invoice, and you can pay them directly or call them first if you want. Mom knows already."],
  ], [], []),
  c("ben-03", "benign_family_emergency", "benign", "holdout", "Grace's sister texts from her known number.", [
    ["Sister (saved contact)", "The vet says Biscuit needs surgery tonight, it's $1,100 and I'm short. Could you lend me $300?"],
    ["Sister (saved contact)", "Totally fine to call me first, I'm at the clinic, here's their number: City Vet 555-0199."],
  ], [], []),
  c("ben-04", "benign_invoice", "benign", "dev", "A bakery receives an email from its long-time flour supplier.", [
    ["Supplier (known vendor)", "Hi Ana, reminder that invoice #4471 for September deliveries ($1,240) is due Friday."],
    ["Supplier (known vendor)", "Please pay to the account on file as usual. Any questions, call Mike at our office."],
  ], [], []),
  c("ben-05", "benign_invoice", "benign", "dev", "A design agency gets a message from a client.", [
    ["Client", "We need the urgent rush fee approved today so your team can deliver Monday. PO 2291 covers it."],
    ["Client", "Our finance team will pay through the usual net-15 process."],
  ], [], []),
  c("ben-06", "benign_invoice", "benign", "holdout", "A plumber sends a final invoice to a homeowner.", [
    ["Plumber", "Job's finished. Final invoice is $560 as quoted, you can pay by card on our website or by check."],
    ["Plumber", "There's a 5% discount if it's paid this week, but no rush otherwise."],
  ], [], []),
  c("ben-07", "benign_rent", "benign", "dev", "A tenant gets a message from her landlord.", [
    ["Landlord", "Hi Jess, rent is due on the 1st as always. Same portal as usual."],
    ["Landlord", "Also, the boiler service is on Tuesday morning."],
  ], [], []),
  c("ben-08", "benign_rent", "benign", "holdout", "A student's landlord sends a late notice.", [
    ["Landlord", "Rent is now 5 days late. Per the lease, a $50 late fee applies after the 10th, so please pay by then through the portal."],
  ], [], []),
  c("ben-09", "benign_friends", "benign", "dev", "Friends split a dinner bill after eating together.", [
    ["Priya (friend)", "That was so fun last night! Your share of dinner was $46."],
    ["Priya (friend)", "Just send it on PayPal Friends and Family whenever, no rush."],
  ], [], []),
  c("ben-10", "benign_friends", "benign", "holdout", "Roommates settle utilities.", [
    ["Roommate", "Electric bill came in at $128, so $64 each. I paid it already, PayPal me back as friends and family when you can."],
  ], [], []),
  c("ben-11", "benign_bank_alert", "benign", "dev", "Ed gets a genuine fraud text from his bank.", [
    ["Bank text", "Northstar Bank: unusual card activity detected. If this wasn't you, call the number on the back of your card."],
    ["Bank text", "We will never ask you to move money or share a passcode."],
  ], [], []),
  c("ben-12", "benign_bank_alert", "benign", "holdout", "Mae calls her bank herself using the number on her card.", [
    ["Bank agent", "Thanks for calling Northstar. I see a declined $92 charge at a gas station. Was that you?"],
    ["Bank agent", "If not, we'll cancel the card and send a new one. You don't need to pay or move anything."],
  ], [], []),
  c("ben-13", "benign_grandchild", "benign", "dev", "Rose's grandson messages from his usual account.", [
    ["Danny (saved contact)", "Hi Grandma! Thanks for the birthday card. Mom said you asked what I want, I'm saving up for a bike."],
    ["Danny (saved contact)", "Honestly anything is great, see you at Sunday lunch!"],
  ], [], []),
  c("ben-14", "benign_grandchild", "benign", "holdout", "A grandmother plans a surprise with her grandson.", [
    ["Grandson (saved contact)", "Can you chip in $40 for Mom's birthday present? I'm buying the necklace she liked."],
    ["Grandson (saved contact)", "Don't tell her, it's a surprise! I'll show you the receipt at the party."],
  ], [], []),
  c("ben-15", "benign_adviser", "benign", "dev", "Irene meets her long-time financial adviser.", [
    ["Adviser", "Your portfolio drifted to 75% equities. I suggest rebalancing to 60/40 given your retirement timeline."],
    ["Adviser", "Take your time, read the proposal, and we can talk with your son present if you like."],
  ], [], []),
  c("ben-16", "benign_adviser", "benign", "holdout", "An accountant reminds a client of a tax deadline.", [
    ["Accountant", "Your quarterly estimated tax of $2,100 is due September 15."],
    ["Accountant", "Pay it directly on the IRS website using IRS Direct Pay, never through me or a third party."],
  ], [], []),
  c("ben-17", "benign_scam_talk", "benign", "dev", "Two neighbours discuss the news.", [
    ["Neighbour", "Did you see the story about people being asked to pay in gift cards by fake IRS agents?"],
    ["Neighbour", "My aunt almost fell for it. Real agencies never demand gift cards or Bitcoin."],
  ], [], []),
  c("ben-18", "benign_scam_talk", "benign", "holdout", "A daughter warns her father.", [
    ["Daughter (saved contact)", "Dad, if anyone calls saying I'm in jail and need bail, hang up and call me. That's a known scam."],
    ["Dad", "Got it, I'll remember the urgency and secrecy tricks."],
  ], [], []),
  c("ben-19", "benign_crypto", "benign", "dev", "Jon buys crypto on a regulated exchange on his own initiative.", [
    ["Jon", "I'm putting $200 into Bitcoin on Coinbase as a long-term bet. I know it could drop."],
    ["Friend", "Fair enough, just don't invest more than you can lose."],
  ], [], []),
  c("ben-20", "benign_school", "benign", "dev", "A parent receives a school email.", [
    ["School office", "Reminder: the $85 museum trip payment is due tomorrow via the parent portal so we can confirm numbers with the museum."],
  ], [], []),
  c("ben-21", "benign_contractor", "benign", "holdout", "A homeowner signs a kitchen contract.", [
    ["Contractor", "Here's the signed contract. The 20% deposit of $3,000 is due before we order cabinets."],
    ["Contractor", "You can pay by card or bank transfer to the company account on the contract."],
  ], [], []),
  c("ben-22", "benign_textbooks", "benign", "dev", "A college student asks her dad for help.", [
    ["Daughter (saved contact)", "Dad, my chemistry textbook is $180 and the bookstore deadline is Friday. Could you help?"],
    ["Daughter (saved contact)", "I can send you the bookstore link so you can pay them directly."],
  ], [], []),
  c("ben-23", "benign_charity", "benign", "dev", "A church member emails the congregation.", [
    ["Church treasurer", "Our matching donor doubles every gift made before Sunday midnight for the food bank."],
    ["Church treasurer", "Give through the church website or the collection plate. Thank you!"],
  ], [], []),
  c("ben-24", "benign_marketplace", "benign", "holdout", "Sara sells a bike to a buyer who came to see it.", [
    ["Buyer (in person)", "Bike's great, I'll take it for $250. I'll pay with PayPal goods and services now while I'm here."],
  ], [], []),
];

