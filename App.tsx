
import React, { useState, useEffect, useRef } from 'react';
import { Settings, Download, RefreshCw, BookOpen, LogOut, Crown, AlertCircle, Clock, Bell, History, X, Lock } from 'lucide-react';
import { BlueprintItem, GeneratedQuestion, PaperHeader, User, ClassConfig, SubscriptionPlan, Transaction, SavedPaper } from './types';
import { BlueprintBuilder } from './components/BlueprintBuilder';
import { PaperPreview } from './components/PaperPreview';
import { AdminPanel } from './components/AdminPanel';
import { StatsChart } from './components/StatsChart';
import { Auth, USERS_STORAGE_KEY } from './components/Auth';
import { SubscriptionModal } from './components/SubscriptionModal';
import { generateQuestionPaperContent, generateQuestionImage } from './services/geminiService';
import { sendNotification } from './services/notificationService';

// Default Curriculum Seed for new users/browsers
const DEFAULT_CURRICULUM: ClassConfig[] = [
    {
        id: 'c9', name: 'Class 9', subjects: [
            { id: 'c9s1', name: 'Mathematics', chapters: [{id: 'c9s1ch1', name: 'Number Systems'}, {id: 'c9s1ch2', name: 'Polynomials'}] },
            { id: 'c9s2', name: 'Science', chapters: [{id: 'c9s2ch1', name: 'Matter in Our Surroundings'}] },
        ]
    },
    {
        id: 'c10', name: 'Class 10', subjects: [
            { id: 'c10s1', name: 'Mathematics', chapters: [{id: 'c10s1ch1', name: 'Real Numbers'}, {id: 'c10s1ch2', name: 'Polynomials'}] },
            { id: 'c10s2', name: 'Science', chapters: [{id: 'c10s2ch1', name: 'Chemical Reactions'}] },
        ]
    },
    { id: 'c11', name: 'Class 11', subjects: [] },
    { id: 'c12', name: 'Class 12', subjects: [] },
];

const CURRICULUM_STORAGE_KEY = 'questgen_curriculum';
const TX_STORAGE_KEY = 'questgen_transactions';
const PAPERS_STORAGE_KEY = 'questgen_papers';

const UsageCard: React.FC<{ user: User }> = ({ user }) => {
    let limitLabel = "Unlimited";
    let count = user.papersGenerated;
    let limit = 9999;
    let percentage = 0;

    if (user.role === 'admin' || user.subscriptionPlan === 'yearly') {
        percentage = 0; // Show full bar or specific color for unlimited
    } else {
        limit = user.subscriptionPlan === 'free' ? 1 : 5;
        percentage = Math.min(100, (count / limit) * 100);
        limitLabel = `${limit}`;
    }

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Paper Quota</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${percentage >= 100 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {user.subscriptionPlan === 'yearly' || user.role === 'admin' ? 'Active' : `${limit - count} Remaining`}
                </span>
            </div>
            
            <div className="flex items-end gap-1 mb-2">
                <span className="text-2xl font-bold text-gray-800">{count}</span>
                <span className="text-sm text-gray-400 font-medium mb-1">/ {limitLabel} Generated</span>
            </div>

            {user.subscriptionPlan !== 'yearly' && user.role !== 'admin' && (
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div 
                        className={`h-full rounded-full transition-all duration-500 ${percentage >= 100 ? 'bg-red-500' : percentage > 70 ? 'bg-orange-500' : 'bg-brand-500'}`} 
                        style={{ width: `${percentage}%` }}
                    ></div>
                </div>
            )}
            {(user.subscriptionPlan === 'yearly' || user.role === 'admin') && (
                 <div className="w-full bg-yellow-100 rounded-full h-1 mt-2">
                    <div className="h-full rounded-full bg-yellow-500 w-full animate-pulse"></div>
                 </div>
            )}
        </div>
    );
};

const App: React.FC = () => {
  // Authentication State
  const [user, setUser] = useState<User | null>(null);

  // Curriculum State
  const [curriculum, setCurriculum] = useState<ClassConfig[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("Class 9");
  const [selectedSubject, setSelectedSubject] = useState<string>("Mathematics");
  
  const [blueprint, setBlueprint] = useState<BlueprintItem[]>([]);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [savedPapers, setSavedPapers] = useState<SavedPaper[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // Track if paper is loaded from save (to restrict editing for monthly users)
  const [isLoadedFromSave, setIsLoadedFromSave] = useState(false);
  
  // Payment State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // Loading State Ref to prevent race conditions during paper load
  const isLoadingPaper = useRef(false);

  const [sampleContext, setSampleContext] = useState(`General Instructions:
1. All questions are compulsory.
2. The question paper consists of 4 sections: A, B, C and D.
3. Section A contains MCQ questions of 1 mark each.
4. Section B contains VSA questions of 2 marks each.
5. Section C contains SA questions of 3 marks each.`);

  const [paperHeader, setPaperHeader] = useState<PaperHeader>({
    schoolName: "YOUR SCHOOL NAME", // Default placeholder
    examName: "MID-TERM EXAMINATION",
    classLevel: "9",
    subject: "Mathematics",
    timeAllowed: "3 Hours",
    maxMarks: 80,
    generalInstructions: "1. All questions are compulsory.\n2. The question paper consists of 4 sections: A, B, C and D.\n3. Section A contains MCQ questions of 1 mark each.\n4. Section B contains VSA questions of 2 marks each.\n5. Section C contains SA questions of 3 marks each."
  });

  // Load Curriculum and Transactions on Mount
  useEffect(() => {
    // Curriculum
    const storedCurriculum = localStorage.getItem(CURRICULUM_STORAGE_KEY);
    if (storedCurriculum) {
        try {
            const parsed = JSON.parse(storedCurriculum);
            setCurriculum(parsed);
            if(parsed.length > 0) {
                setSelectedClass(parsed[0].name);
                if(parsed[0].subjects.length > 0) setSelectedSubject(parsed[0].subjects[0].name);
            } else {
                setSelectedClass("");
                setSelectedSubject("");
            }
        } catch (error) {
            setCurriculum(DEFAULT_CURRICULUM);
            localStorage.setItem(CURRICULUM_STORAGE_KEY, JSON.stringify(DEFAULT_CURRICULUM));
        }
    } else {
        setCurriculum(DEFAULT_CURRICULUM);
        localStorage.setItem(CURRICULUM_STORAGE_KEY, JSON.stringify(DEFAULT_CURRICULUM));
    }

    // Transactions
    const storedTx = localStorage.getItem(TX_STORAGE_KEY);
    if (storedTx) {
        setTransactions(JSON.parse(storedTx));
    }

    // Saved Papers
    const storedPapers = localStorage.getItem(PAPERS_STORAGE_KEY);
    if (storedPapers) {
        setSavedPapers(JSON.parse(storedPapers));
    }
  }, []);

  // Sync Curriculum changes to storage
  const handleCurriculumUpdate = (newCurriculum: ClassConfig[]) => {
      setCurriculum(newCurriculum);
      localStorage.setItem(CURRICULUM_STORAGE_KEY, JSON.stringify(newCurriculum));
  };

  // Effect to set School Name once user logs in
  useEffect(() => {
    if (user && user.schoolName) {
      setPaperHeader(prev => ({
        ...prev,
        schoolName: user.schoolName
      }));
    }
  }, [user]);

  // Effect to update header when class/subject changes
  // BUT only if we are in "fresh" mode (no questions generated).
  // If we have loaded a paper (questions exist), we DON'T want to overwrite the loaded header.
  useEffect(() => {
    // CRITICAL: If we are currently loading a paper programmatically, skip this auto-reset
    if (isLoadingPaper.current) {
        // We do NOT set isLoadingPaper.current = false here. 
        // We let the loading function handle the transition to ensure atomicity.
        return;
    }

    if (generatedQuestions.length === 0) {
      setPaperHeader(prev => ({
        ...prev,
        classLevel: selectedClass.replace('Class ', ''),
        subject: selectedSubject.replace('Class ', '') 
      }));
    }
  }, [selectedClass, selectedSubject, generatedQuestions.length]);

  // Check for Expiry Warning on Login or User Change
  useEffect(() => {
    if (user && user.subscriptionExpiry) {
        const now = new Date();
        const expiry = new Date(user.subscriptionExpiry);
        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // If expiring in less than 5 days and not expired yet
        if (diffDays > 0 && diffDays <= 5) {
            sendNotification('EXPIRY_WARNING', user, { daysLeft: diffDays });
        }
        // If expired
        if (diffDays <= 0) {
            sendNotification('EXPIRED', user);
        }
    }
  }, [user?.id]); // Only run when user identity changes

  const handleLogin = (loggedInUser: User) => {
    // Ensure legacy users have default subscription fields if they login
    const updatedUser = {
        ...loggedInUser,
        subscriptionPlan: loggedInUser.subscriptionPlan || 'free',
        papersGenerated: loggedInUser.papersGenerated || 0
    };
    setUser(updatedUser);

    // Auto-prompt subscription for new free users who have used their quota
    if (updatedUser.role === 'teacher' && updatedUser.subscriptionPlan === 'free' && updatedUser.papersGenerated >= 1) {
        setShowSubscription(true);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setBlueprint([]);
    setGeneratedQuestions([]);
    setShowSubscription(false);
    setIsLoadedFromSave(false);
  };

  const addToBlueprint = (item: BlueprintItem) => {
    setBlueprint([...blueprint, item]);
  };

  const removeFromBlueprint = (id: string) => {
    setBlueprint(blueprint.filter(b => b.id !== id));
  };

  // Subscription Logic & Access Control
  const checkUsageLimit = (): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true; // Admins unlimited

    const plan = user.subscriptionPlan;
    const count = user.papersGenerated;

    // 1. Time-based Expiration Check
    if (user.subscriptionExpiry) {
        const now = new Date();
        const expiryDate = new Date(user.subscriptionExpiry);
        if (now > expiryDate) {
            alert("Your Subscription has EXPIRED. Please renew your plan to continue generating papers.");
            setShowSubscription(true);
            return false;
        }
    }

    // 2. Count-based Limit Check
    if (plan === 'yearly') return true; // Yearly count unlimited (controlled by time above)
    
    if (plan === 'monthly') {
        if (count >= 5) {
            alert("Monthly Limit Reached (5 Papers). Please upgrade to Yearly for unlimited access or wait for next renewal.");
            setShowSubscription(true);
            return false;
        }
        return true;
    }

    if (plan === 'free') {
        if (count >= 1) {
            alert("Free Trial Limit Reached (1 Paper). Please upgrade to continue.");
            setShowSubscription(true);
            return false;
        }
        return true;
    }

    return false;
  };

  const incrementUsageStats = () => {
    if (!user) return;
    const updatedUser = { ...user, papersGenerated: (user.papersGenerated || 0) + 1 };
    setUser(updatedUser);
    
    // Update LocalStorage
    const storedUsersStr = localStorage.getItem(USERS_STORAGE_KEY);
    if (storedUsersStr) {
        const users: User[] = JSON.parse(storedUsersStr);
        const newUsers = users.map(u => u.email === user.email ? updatedUser : u);
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(newUsers));
    }
  };

  // Step 1: Teacher pays, transaction is PENDING
  const handlePayment = (plan: SubscriptionPlan, amount: number) => {
    if (!user) return;
    
    // 1. Record Transaction as PENDING
    const newTx: Transaction = {
        id: `tx_${Date.now()}`,
        userId: user.id || '',
        userName: user.name,
        userEmail: user.email,
        plan: plan,
        amount: amount,
        date: new Date().toISOString(),
        status: 'pending' // Approval required
    };
    
    const updatedTx = [newTx, ...transactions];
    setTransactions(updatedTx);
    localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(updatedTx));

    // 2. Set User Pending State (DO NOT upgrade plan yet)
    const updatedUser: User = { 
        ...user, 
        pendingSubscriptionPlan: plan
    };
    setUser(updatedUser);

    // 3. Save User to LocalStorage
    const storedUsersStr = localStorage.getItem(USERS_STORAGE_KEY);
    if (storedUsersStr) {
        const users: User[] = JSON.parse(storedUsersStr);
        const newUsers = users.map(u => u.email === user.email ? updatedUser : u);
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(newUsers));
    }
  };

  // Step 2: Admin Approves
  const handleApproveTransaction = (txId: string) => {
    // 1. Update Transaction Status
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;

    const updatedTransactions = transactions.map(t =>
        t.id === txId ? { ...t, status: 'success' as const } : t
    );
    setTransactions(updatedTransactions);
    localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(updatedTransactions));

    // 2. Calculate New Expiry Date
    const now = new Date();
    let newExpiryDate: Date | undefined = undefined;

    if (tx.plan === 'monthly') {
        newExpiryDate = new Date(now.setDate(now.getDate() + 30));
    } else if (tx.plan === 'yearly') {
        newExpiryDate = new Date(now.setDate(now.getDate() + 365));
    }

    const expiryISOString = newExpiryDate ? newExpiryDate.toISOString() : undefined;

    // 3. Update User Plan in Storage
    const storedUsersStr = localStorage.getItem(USERS_STORAGE_KEY);
    if (storedUsersStr) {
        const users: User[] = JSON.parse(storedUsersStr);
        
        let targetUserForNotification: User | null = null;

        const updatedUsers = users.map(u => {
            if (u.id === tx.userId || u.email === tx.userEmail) {
                const updatedU = {
                    ...u,
                    subscriptionPlan: tx.plan,
                    pendingSubscriptionPlan: undefined, // Clear pending
                    papersGenerated: 0, // Reset usage limits for new plan
                    subscriptionExpiry: expiryISOString
                };
                targetUserForNotification = updatedU;
                return updatedU;
            }
            return u;
        });
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));

        // 4. Send Notification
        if (targetUserForNotification) {
            sendNotification('UPGRADE', targetUserForNotification, { plan: tx.plan, expiry: expiryISOString });
        }

        // 5. If the currently logged-in admin is also the user
        if (user && (user.id === tx.userId || user.email === tx.userEmail)) {
             setUser({
                 ...user,
                 subscriptionPlan: tx.plan,
                 pendingSubscriptionPlan: undefined,
                 papersGenerated: 0,
                 subscriptionExpiry: expiryISOString
             });
        }
    }
  };

  // Step 3: Admin Rejects
  const handleRejectTransaction = (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;

    // 1. Update Transaction Status
    const updatedTransactions = transactions.map(t =>
        t.id === txId ? { ...t, status: 'rejected' as const } : t
    );
    setTransactions(updatedTransactions);
    localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(updatedTransactions));

    // 2. Clear Pending Status on User
    const storedUsersStr = localStorage.getItem(USERS_STORAGE_KEY);
    if (storedUsersStr) {
        const users: User[] = JSON.parse(storedUsersStr);
        const updatedUsers = users.map(u => {
            if (u.id === tx.userId || u.email === tx.userEmail) {
                return {
                    ...u,
                    pendingSubscriptionPlan: undefined
                };
            }
            return u;
        });
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedUsers));
        
        if (user && (user.id === tx.userId || user.email === tx.userEmail)) {
            setUser({ ...user, pendingSubscriptionPlan: undefined });
       }
    }
  };

  // --- Paper History Handlers ---

  const handleSavePaper = (questions: GeneratedQuestion[], header: PaperHeader, usedBlueprint: BlueprintItem[]) => {
      if (!user) return;
      if (!questions || questions.length === 0) return; // Don't save empty papers
      
      const newPaper: SavedPaper = {
          id: `paper_${Date.now()}`,
          userId: user.id || user.email,
          userName: user.name,
          userEmail: user.email,
          createdAt: new Date().toISOString(),
          header: header,
          questions: questions,
          blueprint: usedBlueprint,
          classLevel: selectedClass,
          subject: selectedSubject
      };

      const updatedPapers = [newPaper, ...savedPapers];
      setSavedPapers(updatedPapers);
      localStorage.setItem(PAPERS_STORAGE_KEY, JSON.stringify(updatedPapers));
  };

  const handleDeletePaper = (paperId: string) => {
      const updatedPapers = savedPapers.filter(p => p.id !== paperId);
      setSavedPapers(updatedPapers);
      localStorage.setItem(PAPERS_STORAGE_KEY, JSON.stringify(updatedPapers));
  };

  const handleLoadPaper = (paper: SavedPaper) => {
      // Set flag to prevent useEffect from resetting header
      isLoadingPaper.current = true;

      // 1. Validate Input
      if (!paper || !Array.isArray(paper.questions) || paper.questions.length === 0) {
          alert("Error: This saved paper appears to be empty or corrupted.");
          isLoadingPaper.current = false; 
          return;
      }

      // 2. Load Questions - This will switch the UI to "Edit Mode"
      // Deep clone to ensure new references
      setGeneratedQuestions(JSON.parse(JSON.stringify(paper.questions)));

      // 3. Load Blueprint (Safe Fallback for legacy papers)
      if (paper.blueprint && Array.isArray(paper.blueprint)) {
          setBlueprint(paper.blueprint);
      } else {
          setBlueprint([]);
      }

      // 4. Load Header (Robust Fallback for Legacy Data)
      const loadedHeader = paper.header || {} as Partial<PaperHeader>;
      const safeHeader: PaperHeader = {
          schoolName: loadedHeader.schoolName ?? user?.schoolName ?? "YOUR SCHOOL NAME",
          examName: loadedHeader.examName ?? "EXAMINATION",
          classLevel: loadedHeader.classLevel ?? paper.classLevel ?? "9",
          subject: loadedHeader.subject ?? paper.subject ?? "",
          timeAllowed: loadedHeader.timeAllowed ?? "3 Hours",
          maxMarks: loadedHeader.maxMarks ?? 0,
          generalInstructions: loadedHeader.generalInstructions ?? "All questions are compulsory."
      };

      // Calculate max marks if not present/zero in saved header but questions exist
      if ((!safeHeader.maxMarks || safeHeader.maxMarks === 0) && paper.questions.length > 0) {
        safeHeader.maxMarks = paper.questions.reduce((sum, q) => sum + (q.marks || 0), 0);
      }

      setPaperHeader(safeHeader);
      
      // 5. Update Class/Subject Selection safely
      if (paper.classLevel) setSelectedClass(paper.classLevel);
      if (paper.subject) setSelectedSubject(paper.subject);
      
      // 6. Set Loaded From Save Flag
      setIsLoadedFromSave(true);

      // 7. Close Modals
      setShowHistory(false);
      setShowAdmin(false); 
      
      // 8. Scroll to preview editor with delay to allow rendering
      setTimeout(() => {
        const previewElement = document.getElementById('preview-section');
        if (previewElement) {
            previewElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // Release the lock after state has settled and scrolled
        isLoadingPaper.current = false;
      }, 500);
  };

  const handleGeneratePaper = async () => {
    if (blueprint.length === 0) return;
    
    // Check if approval is pending
    if (user?.pendingSubscriptionPlan) {
        alert("Your plan upgrade request is pending approval. You cannot generate papers until it is approved.");
        return;
    }

    // Check Subscription Limit
    if (!checkUsageLimit()) return;

    setIsGenerating(true);
    try {
      // Determine Context: Check for Specific Subject Context first, then fallback to Global
      const currentClassConfig = curriculum.find(c => c.name === selectedClass);
      const currentSubjectConfig = currentClassConfig?.subjects.find(s => s.name === selectedSubject);
      
      const contextToUse = currentSubjectConfig?.samplePaperContext || sampleContext;

      const questions = await generateQuestionPaperContent(
        blueprint, 
        selectedClass, 
        selectedSubject, 
        contextToUse
      );

      if (!questions || questions.length === 0) {
          throw new Error("No questions generated");
      }

      const questionsWithMedia = questions.map(q => {
        const bpSource = blueprint.find(b => b.id === q.blueprintId);
        if (bpSource && bpSource.userUploadedImage) {
          return { ...q, imageUrl: bpSource.userUploadedImage };
        }
        return q;
      });
      
      setGeneratedQuestions(questionsWithMedia);
      
      const total = questionsWithMedia.reduce((sum, q) => sum + q.marks, 0);
      const updatedHeader = {...paperHeader, maxMarks: total};
      setPaperHeader(updatedHeader);
      
      // Fresh generation: Not loaded from save
      setIsLoadedFromSave(false);

      // Increment Usage upon successful generation
      incrementUsageStats();

      // Automatically Save Paper
      handleSavePaper(questionsWithMedia, updatedHeader, blueprint);

      setTimeout(() => {
        document.getElementById('preview-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);

    } catch (error) {
      alert("Failed to generate paper. Please check your API Key or try again.");
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateImageForQuestion = async (questionId: string, prompt: string) => {
    const qIndex = generatedQuestions.findIndex(q => q.id === questionId);
    if (qIndex === -1) return;

    const imageUrl = await generateQuestionImage(prompt);
    if (imageUrl) {
      setGeneratedQuestions(prev => {
        const newQ = [...prev];
        newQ[qIndex] = { ...newQ[qIndex], imageUrl };
        return newQ;
      });
    } else {
      alert("Could not generate image. Try a different prompt.");
    }
  };

  const resetWorkspace = () => {
    setBlueprint([]);
    setGeneratedQuestions([]);
    setIsLoadedFromSave(false);
    setPaperHeader(prev => ({
      ...prev,
      examName: "MID-TERM EXAMINATION",
      timeAllowed: "3 Hours",
      maxMarks: 80, // Reset to default
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Determine View Only Mode (Restricted)
  // Monthly users are restricted when viewing Saved Papers (View Only)
  // Yearly users and Admins have full access.
  const isViewOnlyMode = isLoadedFromSave && user?.subscriptionPlan !== 'yearly' && user?.role !== 'admin';

  const handleDownloadPdf = () => {
    if (isViewOnlyMode) {
        alert("Upgrade Required: You need a Yearly Plan to download, print, or edit saved papers.");
        setShowSubscription(true);
        return;
    }

    const element = document.getElementById('paper-container');
    if (!element) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to generate the PDF view.");
      return;
    }

    const schoolName = paperHeader.schoolName || "Paper";

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${schoolName} - Question Paper</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
           tailwind.config = {
             theme: {
               extend: {
                 colors: {
                   brand: { 50: '#f0fdfa', 100: '#ccfbf1', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 900: '#134e4a' }
                 },
                 fontFamily: {
                   serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
                 }
               },
             },
           }
        </script>
        <style>
          body { 
            background: white; 
            font-family: Georgia, Cambria, "Times New Roman", Times, serif;
            color: black;
            margin: 0;
            padding: 0;
          }
          #print-wrapper {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            padding: 12mm;
            box-sizing: border-box;
          }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:inline { display: inline !important; }
          .print\\:inline-block { display: inline-block !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          input, textarea, select, button { display: none !important; }
          .no-print { display: none !important; }
          .break-words { overflow-wrap: break-word; word-wrap: break-word; }
          .whitespace-pre-wrap { white-space: pre-wrap; }
          @media print {
            @page { 
              size: A4; 
              margin: 0; 
            }
            body { 
              margin: 0; 
              -webkit-print-color-adjust: exact; 
            }
            #print-wrapper {
              width: 100%;
              max-width: 100%;
              margin: 0;
              padding: 12mm;
            }
          }
        </style>
      </head>
      <body>
        <div id="print-wrapper">
          ${element.innerHTML}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 800);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Clear everything in the app like fresh generation when comes back to app
    resetWorkspace();
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  // Calculate Expiry Status for UI
  const isExpired = user.subscriptionExpiry ? new Date() > new Date(user.subscriptionExpiry) : false;
  const daysToExpiry = user.subscriptionExpiry 
    ? Math.ceil((new Date(user.subscriptionExpiry).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
    : null;
  const isExpiringSoon = daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry <= 5;
  
  // Filter papers for current user
  const userPapers = savedPapers.filter(p => p.userId === user.id || p.userEmail === user.email);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 h-16 px-6 flex items-center justify-between sticky top-0 z-40 no-print">
        <div className="flex items-center gap-3">
          <div className="bg-brand-600 p-2 rounded-lg">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <div>
             <h1 className="text-xl font-bold text-gray-800 tracking-tight leading-tight">RKS QP <span className="text-brand-600">Maker</span></h1>
             {user.role === 'admin' && <span className="text-[10px] uppercase font-bold text-white bg-gray-800 px-1.5 py-0.5 rounded">Admin Panel</span>}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="text-right hidden md:block mr-2">
              <div className="text-sm font-bold text-gray-700">{user.name}</div>
              <div className="text-xs text-gray-500 flex justify-end items-center gap-1">
                 {user.subscriptionPlan === 'yearly' && <Crown size={10} className="text-yellow-500 fill-yellow-500"/>}
                 <span className="capitalize">{user.subscriptionPlan} Plan</span>
              </div>
           </div>

          {/* Upgrade Button */}
          {user.role === 'teacher' && user.subscriptionPlan !== 'yearly' && (
              <button 
                onClick={() => setShowSubscription(true)}
                className="flex bg-gradient-to-r from-yellow-500 to-yellow-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow hover:shadow-lg transition-all items-center gap-1"
              >
                <Crown size={12} fill="currentColor"/> Upgrade
              </button>
          )}

          {/* History Button */}
           <button 
                onClick={() => setShowHistory(true)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors flex items-center gap-1"
                title="My Papers"
            >
                <History className="w-5 h-5" />
                <span className="hidden sm:inline text-xs font-bold">History</span>
            </button>

          {(user.role === 'admin' || user.role === 'teacher') && (
            <button 
                onClick={() => setShowAdmin(true)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
                title="Settings"
            >
                <Settings className="w-5 h-5" />
            </button>
          )}
          
          <div className="h-6 w-px bg-gray-200 mx-1"></div>
          
          <button 
            onClick={handleDownloadPdf}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${isViewOnlyMode ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700 text-white'}`}
          >
            {isViewOnlyMode ? <Lock className="w-4 h-4"/> : <Download className="w-4 h-4" />}
            PDF
          </button>

          <button 
            onClick={handleLogout}
            className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors ml-1"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-10 flex flex-col gap-6">
        
        {/* Notifications & Warnings */}
        <div className="flex flex-col gap-2 no-print">
            {/* Pending Plan Warning */}
            {user.pendingSubscriptionPlan && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center gap-3 text-orange-800 animate-fade-in">
                    <Clock className="w-5 h-5 flex-shrink-0" />
                    <div>
                        <h3 className="font-bold text-sm">Upgrade Pending Approval</h3>
                        <p className="text-sm">Your request to upgrade to the <span className="font-bold capitalize">{user.pendingSubscriptionPlan}</span> plan is currently awaiting Admin approval.</p>
                    </div>
                </div>
            )}

            {/* Expired Warning */}
            {isExpired && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-800 animate-pulse">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <div>
                        <h3 className="font-bold text-sm">Subscription Expired</h3>
                        <p className="text-sm">Your plan expired on {new Date(user.subscriptionExpiry!).toLocaleDateString()}. Please <button onClick={()=>setShowSubscription(true)} className="underline font-bold">Renew Now</button> to generate papers.</p>
                    </div>
                </div>
            )}

            {/* Expiring Soon Warning */}
            {isExpiringSoon && !isExpired && (
                 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3 text-yellow-800">
                    <Bell className="w-5 h-5 flex-shrink-0" />
                    <div>
                        <h3 className="font-bold text-sm">Subscription Expiring Soon</h3>
                        <p className="text-sm">Your plan will expire in <strong>{daysToExpiry} days</strong>. <button onClick={()=>setShowSubscription(true)} className="underline font-bold">Renew Now</button> to avoid interruption.</p>
                    </div>
                </div>
            )}
        </div>

        {/* Configuration Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
          <div className="lg:col-span-2">
            <BlueprintBuilder 
              onAddToBlueprint={addToBlueprint}
              blueprint={blueprint}
              onRemoveItem={removeFromBlueprint}
              onGenerate={handleGeneratePaper}
              isGenerating={isGenerating}
              selectedClass={selectedClass}
              setSelectedClass={setSelectedClass}
              selectedSubject={selectedSubject}
              setSelectedSubject={setSelectedSubject}
              curriculum={curriculum}
              isPendingApproval={!!user?.pendingSubscriptionPlan || isExpired}
            />
          </div>
          <div className="lg:col-span-1 flex flex-col gap-6">
             <UsageCard user={user} />
             
             <StatsChart questions={generatedQuestions} />
             
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 text-sm text-gray-600">
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <RefreshCw size={16} className="text-brand-600" />
                  How it works
                </h3>
                <ul className="space-y-2 list-disc pl-4">
                  <li>Add chapters and topics to the blueprint on the left.</li>
                  <li>Select question types (MCQ, Short Answer, etc.).</li>
                  <li>Click <strong>Generate Question Paper</strong> to create the exam below.</li>
                  <li>Edit the generated questions directly in the preview.</li>
                </ul>
             </div>
          </div>
        </div>

        {/* Paper Preview Area */}
        <div id="preview-section" className="w-full flex justify-center pb-20 scroll-mt-24 relative">
          {generatedQuestions.length > 0 ? (
            <PaperPreview 
              header={paperHeader}
              setHeader={setPaperHeader}
              questions={generatedQuestions}
              setQuestions={setGeneratedQuestions}
              onGenerateImage={handleGenerateImageForQuestion}
              readOnly={isViewOnlyMode}
            />
          ) : (
            <div className="text-center text-gray-400 py-20 border-2 border-dashed border-gray-200 rounded-xl w-full bg-white no-print">
              <div className="mb-4 inline-block p-4 bg-gray-50 rounded-full">
                <BookOpen size={40} className="text-gray-300" />
              </div>
              <h3 className="text-lg font-medium text-gray-500">Question Paper Preview</h3>
              <p className="text-sm text-gray-400 mt-1">Generate questions to see the paper layout here.</p>
            </div>
          )}
        </div>

      </main>

      {/* Admin Modal */}
      <AdminPanel 
        isOpen={showAdmin} 
        onClose={() => setShowAdmin(false)}
        sampleContext={sampleContext}
        setSampleContext={setSampleContext}
        curriculum={curriculum}
        setCurriculum={handleCurriculumUpdate}
        transactions={transactions}
        onApproveTransaction={handleApproveTransaction}
        onRejectTransaction={handleRejectTransaction}
        savedPapers={savedPapers}
        onDeletePaper={handleDeletePaper}
        onLoadPaper={handleLoadPaper}
      />

      {/* Subscription Modal */}
      <SubscriptionModal 
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        user={user}
        onPayment={handlePayment}
      />

      {/* My History Modal */}
      {showHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                  <div className="flex justify-between items-center p-4 border-b">
                      <h3 className="text-lg font-bold flex items-center gap-2"><History size={20}/> My Saved Papers</h3>
                      <button onClick={()=>setShowHistory(false)} className="text-gray-500 hover:text-gray-800"><X size={20}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                      {userPapers.length === 0 && <div className="text-center text-gray-400 py-8">No papers generated yet.</div>}
                      <div className="space-y-3">
                          {userPapers.map(p => (
                              <div key={p.id} className="border rounded-lg p-3 hover:bg-gray-50 flex justify-between items-center group">
                                  <div>
                                      <div className="font-bold text-gray-800">{p.header.examName}</div>
                                      <div className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleDateString()} &bull; {p.classLevel} &bull; {p.subject}</div>
                                  </div>
                                  <div className="flex gap-2">
                                      <button 
                                          onClick={() => {
                                              if (confirm("Load this paper into the workspace? Unsaved changes will be lost.")) {
                                                handleLoadPaper(p);
                                              }
                                          }}
                                          className={`text-xs px-3 py-1.5 rounded text-white ${user.subscriptionPlan === 'yearly' || user.role === 'admin' ? 'bg-brand-600 hover:bg-brand-700' : 'bg-gray-600 hover:bg-gray-700'}`}
                                      >
                                          {user.subscriptionPlan === 'yearly' || user.role === 'admin' ? 'Load & Edit' : 'View Only'}
                                      </button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
