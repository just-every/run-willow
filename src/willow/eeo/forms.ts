// The pinned, reviewed texts and rules EEO-001 offers. Each carries its source and the date it was read.

/** EEO-1 Component 1 rule version: the filing categories and how a category is derived. */
export const RULE_VERSION = 'eeo1-component1-2024'
export const RULE_SOURCE = { url: 'https://www.eeocdata.org/EEO1/home/instructionbooklet', read: '2026-10-21', note: 'Seven race/ethnicity filing categories; sex is filed as female or male. A self-identified value with no filing category (for example Nonbinary) is kept as answered and flagged, never mapped.' }

export const HISPANIC = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'declined', label: 'I do not wish to self-identify' },
] as const

export const RACES = [
  { value: 'white', label: 'White' },
  { value: 'black_african_american', label: 'Black or African American' },
  { value: 'asian', label: 'Asian' },
  { value: 'native_hawaiian_pacific_islander', label: 'Native Hawaiian or Other Pacific Islander' },
  { value: 'american_indian_alaska_native', label: 'American Indian or Alaska Native' },
  { value: 'declined', label: 'I do not wish to self-identify' },
] as const

export const DISCLOSURES = [
  'Answering is voluntary. Declining has no adverse effect on you.',
  'Your answers are kept in a restricted EEO record separate from your personnel file. They are never shown to a manager or hiring team and are used only for government reporting and aggregate analysis.',
  'If you decline, the employer may record a category from employment records as the EEO-1 instructions allow. That record is labeled with its source and is never shown as your answer.',
] as const

export const DISABILITY = [
  { value: 'yes', label: 'Yes, I have a disability, or have had one in the past' },
  { value: 'no', label: 'No, I do not have a disability and have not had one in the past' },
  { value: 'declined', label: 'I do not want to answer' },
] as const

/** Form CC-305, OMB 1250-0005, expiring 07/31/2029 (OFCCP's unchanged renewal of 16 July 2026). */
export const CC305 = {
  title: 'Voluntary Self-Identification of Disability',
  formNumber: 'Form CC-305',
  omb: 'OMB Control Number 1250-0005',
  expires: 'Expires 07/31/2029',
  source: { url: 'https://www.dol.gov/sites/dolgov/files/OFCCP/regs/compliance/sec503/Self_ID_Forms/503Self-IDForm.pdf', read: '2026-10-21', sha256: '6573b6378916de1329dd21750c2a18efdec9ba6b456365e9b3e8ff6230779427' },
  notice: 'The Department of Labor published a final rule on 21 August 2026 that discontinues this form effective 21 September 2026. Willow offers it only while you record the employer as a federal contractor.',
  why: [
    'We are a federal contractor or subcontractor. The law requires us to provide equal employment opportunity to qualified people with disabilities. We have a goal of having at least 7% of our workers as people with disabilities. The law says we must measure our progress towards this goal. To do this, we must ask applicants and employees if they have a disability or have ever had one. People can become disabled, so we need to ask this question at least every five years.',
    'Completing this form is voluntary, and we hope that you will choose to do so. Your answer is confidential. No one who makes hiring decisions will see it. Your decision to complete the form and your answer will not harm you in any way. If you want to learn more about the law or this form, visit the U.S. Department of Labor’s Office of Federal Contract Compliance Programs (OFCCP) website at www.dol.gov/ofccp.',
  ],
  howTitle: 'How do you know if you have a disability?',
  how: 'A disability is a condition that substantially limits one or more of your “major life activities.” If you have or have ever had such a condition, you are a person with a disability. Disabilities include, but are not limited to:',
  examples: [
    'Alcohol or other substance use disorder (not currently using drugs illegally)',
    'Autoimmune disorder, for example, lupus, fibromyalgia, rheumatoid arthritis, HIV/AIDS',
    'Blind or low vision',
    'Cancer (past or present)',
    'Cardiovascular or heart disease',
    'Celiac disease',
    'Cerebral palsy',
    'Deaf or serious difficulty hearing',
    'Diabetes',
    'Disfigurement, for example, disfigurement caused by burns, wounds, accidents, or congenital disorders',
    'Epilepsy or other seizure disorder',
    'Gastrointestinal disorders, for example, Crohn\'s Disease, irritable bowel syndrome',
    'Intellectual or developmental disability',
    'Mental health conditions, for example, depression, bipolar disorder, anxiety disorder, schizophrenia, PTSD',
    'Missing limbs or partially missing limbs',
    'Mobility impairment, benefiting from the use of a wheelchair, scooter, walker, leg brace(s) and/or other supports',
    'Nervous system condition, for example, migraine headaches, Parkinson’s disease, multiple sclerosis (MS)',
    'Neurodivergence, for example, attention-deficit/hyperactivity disorder (ADHD), autism spectrum disorder, dyslexia, dyspraxia, other learning disabilities',
    'Partial or complete paralysis (any cause)',
    'Pulmonary or respiratory conditions, for example, tuberculosis, asthma, emphysema',
    'Short stature (dwarfism)',
    'Traumatic brain injury',
  ],
  choose: 'Please check one of the boxes below:',
  burden: 'PUBLIC BURDEN STATEMENT: According to the Paperwork Reduction Act of 1995 no persons are required to respond to a collection of information unless such collection displays a valid OMB control number. This survey should take about 5 minutes to complete.',
} as const

export const VETERAN_CLASSES = [
  { value: 'disabled', label: 'Disabled veteran' },
  { value: 'recently_separated', label: 'Recently separated veteran' },
  { value: 'wartime_badge', label: 'Active wartime or campaign badge veteran' },
  { value: 'service_medal', label: 'Armed Forces service medal veteran' },
] as const

export const VETERAN_CHOICES = [
  { value: 'protected', label: 'I belong to one or more of the classifications of protected veterans listed above' },
  { value: 'not_protected', label: 'I am NOT a protected veteran' },
  { value: 'declined', label: 'I do not wish to self-identify' },
] as const

/** 41 CFR 60-300 Appendix B (eCFR text in force from 15 August 2016), the post-offer invitation extended to employees. */
export const VETERAN_INVITATION = {
  title: 'Protected veteran invitation to self-identify',
  source: { url: 'https://www.ecfr.gov/current/title-41/part-60-300/appendix-Appendix%20B%20to%20Part%2060-300', read: '2026-10-21', sha256: '9da2bcce42f53cb4518ec9befef65b9f0c479b82ebff80962314a0eae9b155ca' },
  intro: [
    'This employer is a Government contractor subject to the Vietnam Era Veterans\' Readjustment Assistance Act of 1974, as amended by the Jobs for Veterans Act of 2002, 38 U.S.C. 4212 (VEVRAA), which requires Government contractors to take affirmative action to employ and advance in employment: (1) disabled veterans; (2) recently separated veterans; (3) active duty wartime or campaign badge veterans; and (4) Armed Forces service medal veterans. These classifications are defined as follows:',
  ],
  definitions: [
    'A “disabled veteran” is one of the following: a veteran of the U.S. military, ground, naval or air service who is entitled to compensation (or who but for the receipt of military retired pay would be entitled to compensation) under laws administered by the Secretary of Veterans Affairs; or a person who was discharged or released from active duty because of a service-connected disability.',
    'A “recently separated veteran” means any veteran during the three-year period beginning on the date of such veteran\'s discharge or release from active duty in the U.S. military, ground, naval, or air service.',
    'An “active duty wartime or campaign badge veteran” means a veteran who served on active duty in the U.S. military, ground, naval or air service during a war, or in a campaign or expedition for which a campaign badge has been authorized under the laws administered by the Department of Defense.',
    'An “Armed forces service medal veteran” means a veteran who, while serving on active duty in the U.S. military, ground, naval or air service, participated in a United States military operation for which an Armed Forces service medal was awarded pursuant to Executive Order 12985.',
  ],
  userra: 'Protected veterans may have additional rights under USERRA—the Uniformed Services Employment and Reemployment Rights Act. In particular, if you were absent from employment in order to perform service in the uniformed service, you may be entitled to be reemployed by your employer in the position you would have obtained with reasonable certainty if not for the absence due to service. For more information, call the U.S. Department of Labor\'s Veterans Employment and Training Service (VETS), toll-free, at 1-866-4-USA-DOL.',
  ask: 'As a Government contractor subject to VEVRAA, we are required to submit a report to the United States Department of Labor each year identifying the number of our employees belonging to each specified “protected veteran” category. If you believe you belong to any of the categories of protected veterans listed above, please indicate by checking the appropriate box below.',
  classesHeading: 'I BELONG TO THE FOLLOWING CLASSIFICATIONS OF PROTECTED VETERANS (CHOOSE ALL THAT APPLY):',
  accommodation: 'If you are a disabled veteran it would assist us if you tell us whether there are accommodations we could make that would enable you to perform the essential functions of the job, including special equipment, changes in the physical layout of the job, changes in the way the job is customarily performed, provision of personal assistance services or other accommodations. This information will assist us in making reasonable accommodations for your disability.',
  voluntary: 'Submission of this information is voluntary and refusal to provide it will not subject you to any adverse treatment. The information provided will be used only in ways that are not inconsistent with the Vietnam Era Veterans\' Readjustment Assistance Act of 1974, as amended.',
  confidential: 'The information you submit will be kept confidential, except that (i) supervisors and managers may be informed regarding restrictions on the work or duties of disabled veterans, and regarding necessary accommodations; (ii) first aid and safety personnel may be informed, when and to the extent appropriate, if you have a condition that might require emergency treatment; and (iii) Government officials engaged in enforcing laws administered by the Office of Federal Contract Compliance Programs, or enforcing the Americans with Disabilities Act, may be informed.',
} as const

/** Which forms were offered when an answer was recorded, kept with it as its source. */
export const CONTRACTOR_FORMS = { cc305: 'CC-305 expires 07/31/2029', veteran: '41 CFR 60-300 Appendix B (2016-08-15)' } as const
