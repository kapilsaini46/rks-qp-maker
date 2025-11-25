
export enum QuestionType {
  MCQ = "Multiple Choice Question",
  ASSERTION_REASON = "Assertion-Reason",
  VSA = "Very Short Answer",
  SA = "Short Answer",
  LA = "Long Answer",
  NUMERICAL = "Numerical",
  CASE_STUDY = "Case Study Based",
  PARAGRAPH = "Paragraph Based",
  DIAGRAM = "Diagram/Drawing"
}

// Deprecated: ClassLevel and Subject enums are replaced by dynamic configuration
// Keeping them briefly for type compatibility during migration if needed, 
// but UI will use the interfaces below.

export interface Chapter {
  id: string;
  name: string;
}

export interface SubjectConfig {
  id: string;
  name: string;
  chapters: Chapter[];
  samplePaperContext?: string; // Specific instructions/sample paper text for this subject
}

export interface ClassConfig {
  id: string;
  name: string;
  subjects: SubjectConfig[];
}

export interface BlueprintItem {
  id: string;
  chapter: string;
  topic: string;
  type: QuestionType;
  count: number;
  marksPerQuestion: number;
  generateImage: boolean;
  userUploadedImage?: string; // Base64 data URI
}

export interface GeneratedQuestion {
  id: string;
  blueprintId?: string; // Link back to blueprint
  type: QuestionType;
  marks: number;
  questionText: string;
  options?: string[]; // For MCQ
  answerKey?: string; // For teacher reference
  imageUrl?: string; // Generated or uploaded image
  section?: string; // e.g., "Section A"
}

export interface PaperHeader {
  schoolName: string;
  location?: string; // School location/city
  examName: string;
  classLevel: string;
  subject: string;
  timeAllowed: string;
  maxMarks: number;
  generalInstructions: string;
}

export type SubscriptionPlan = 'free' | 'monthly' | 'yearly';

export interface Transaction {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  plan: SubscriptionPlan;
  amount: number;
  date: string; // ISO String
  status: 'success' | 'failed' | 'pending' | 'rejected';
}

export interface User {
  id?: string;
  name: string;
  email: string;
  mobile: string;
  schoolName: string;
  role: 'teacher' | 'admin';
  isLoggedIn: boolean;
  password?: string; // Included for Admin management purposes
  
  // Subscription Details
  subscriptionPlan: SubscriptionPlan;
  pendingSubscriptionPlan?: SubscriptionPlan; // Plan waiting for approval
  papersGenerated: number;
  subscriptionExpiry?: string; // ISO Date string
}

export interface SavedPaper {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string; // ISO String
  header: PaperHeader;
  questions: GeneratedQuestion[];
  blueprint: BlueprintItem[];
  classLevel: string;
  subject: string;
}
