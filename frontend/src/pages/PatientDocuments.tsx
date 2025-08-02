import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, User, UserCheck, Brain, Download, AlertCircle, Trash2, UserPlus, ArrowLeft, MessageCircle, Send } from "lucide-react";

interface PatientFile {
  id: string;
  patient_id: string;
  filename: string;
  file_type: string;
  upload_date: string;
  file_size: number;
  extracted_text?: string;
  ai_summary?: string;
}

export default function PatientDocuments() {
  const { toast } = useToast();
  const [userRole, setUserRole] = useState<'patient' | 'doctor' | 'register' | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [isPatientAuthenticated, setIsPatientAuthenticated] = useState<boolean>(false);
  const [patientFiles, setPatientFiles] = useState<PatientFile[]>([]);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [registrationData, setRegistrationData] = useState({
    name: '',
    age: '',
    gender: '',
    email: '',
    phone: ''
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [doctorPatients, setDoctorPatients] = useState<any[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);

  // Chatbot state
  const [chatMessages, setChatMessages] = useState<Array<{id: string, text: string, sender: 'doctor' | 'ai', timestamp: string}>>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);

  // Load patient files automatically for doctors when they select a patient
  useEffect(() => {
    if (userRole === 'doctor' && selectedPatientId) {
      loadPatientFiles();
    }
  }, [selectedPatientId, userRole]);

  // Load all patients for doctor when they access doctor role
  useEffect(() => {
    if (userRole === 'doctor') {
      loadDoctorPatients();
    }
  }, [userRole]);

  const loadDoctorPatients = async () => {
    setIsLoadingPatients(true);
    try {
      const response = await fetch('http://localhost:8000/api/v1/doctor/patients');
      if (response.ok) {
        const data = await response.json();
        console.log('Loaded doctor patients:', data);
        setDoctorPatients(data.patients || []);
      } else {
        console.error('Failed to load doctor patients');
        toast({
          title: "Error",
          description: "Failed to load patient list",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error loading doctor patients:', error);
      toast({
        title: "Error",
        description: "Failed to connect to server",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPatients(false);
    }
  };

  const loadPatientFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch(`http://localhost:8000/api/v1/patients/${selectedPatientId}/files`);
      if (response.ok) {
        const data = await response.json();
        setPatientFiles(data.files || []);
      }
    } catch (error) {
      console.error('Error loading patient files:', error);
      toast({
        title: "Error",
        description: "Failed to load patient files",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !selectedPatientId) return;

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'general');
      formData.append('description', `Medical file uploaded by ${userRole === 'doctor' ? 'Dr. Smith' : 'Patient'}`);

      try {
        const response = await fetch(`http://localhost:8000/api/v1/patients/${selectedPatientId}/files/upload`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          toast({
            title: "Success",
            description: `File "${file.name}" uploaded successfully`,
          });
          loadPatientFiles(); // Refresh the files list
        } else {
          throw new Error('Upload failed');
        }
      } catch (error) {
        console.error('Error uploading file:', error);
        toast({
          title: "Error",
          description: `Failed to upload file "${file.name}"`,
          variant: "destructive",
        });
      }
    }

    // Clear the input
    event.target.value = '';
  };

  const generateAISummary = async () => {
    if (!selectedPatientId) {
      toast({
        title: "Error",
        description: "Please select a patient first",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSummary(true);
    try {
      const response = await fetch(`http://localhost:8000/api/v1/patients/${selectedPatientId}/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_ids: null, // null means include all files
          summary_type: "comprehensive"
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAiSummary(data.summary);
        toast({
          title: "Success",
          description: "AI summary generated successfully",
        });
      } else {
        throw new Error('Failed to generate summary');
      }
    } catch (error) {
      console.error('Error generating AI summary:', error);
      toast({
        title: "Error",
        description: "Failed to generate AI summary",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const askAIQuestion = async () => {
    if (!currentQuestion.trim() || !selectedPatientId) {
      toast({
        title: "Error",
        description: "Please enter a question and select a patient",
        variant: "destructive",
      });
      return;
    }

    const questionId = Date.now().toString();
    const timestamp = new Date().toLocaleTimeString();

    // Add doctor's question to chat
    const doctorMessage = {
      id: questionId,
      text: currentQuestion,
      sender: 'doctor' as const,
      timestamp
    };

    setChatMessages(prev => [...prev, doctorMessage]);
    setIsAsking(true);

    try {
      const formData = new FormData();
      formData.append('question', currentQuestion);
      formData.append('context_type', 'all');

      const response = await fetch(`http://localhost:8000/api/v1/patients/${selectedPatientId}/chat`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        
        // Add AI response to chat
        const aiMessage = {
          id: (Date.now() + 1).toString(),
          text: data.response,
          sender: 'ai' as const,
          timestamp: new Date().toLocaleTimeString()
        };

        setChatMessages(prev => [...prev, aiMessage]);
        setCurrentQuestion('');
        
        toast({
          title: "Success",
          description: "AI response received",
        });
      } else {
        throw new Error('Failed to get AI response');
      }
    } catch (error) {
      console.error('Error asking AI question:', error);
      
      // Add error message to chat
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I encountered an error while processing your question. Please try again.",
        sender: 'ai' as const,
        timestamp: new Date().toLocaleTimeString()
      };

      setChatMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: "Error",
        description: "Failed to get AI response",
        variant: "destructive",
      });
    } finally {
      setIsAsking(false);
    }
  };

  const clearChat = () => {
    setChatMessages([]);
  };

  const deleteFile = async (fileId: string, filename: string) => {
    // Ask for confirmation before deleting
    const confirmed = window.confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:8000/api/v1/files/${fileId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `File "${filename}" deleted successfully`,
        });
        loadPatientFiles(); // Refresh the files list
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      toast({
        title: "Error",
        description: `Failed to delete file "${filename}"`,
        variant: "destructive",
      });
    }
  };

  const registerNewPatient = async () => {
    if (!registrationData.name || !registrationData.age || !registrationData.gender) {
      toast({
        title: "Error",
        description: "Please fill in all required fields (Name, Age, Gender)",
        variant: "destructive",
      });
      return;
    }

    setIsRegistering(true);
    try {
      const formData = new FormData();
      formData.append('name', registrationData.name);
      formData.append('age', registrationData.age);
      formData.append('gender', registrationData.gender);
      if (registrationData.email) formData.append('email', registrationData.email);
      if (registrationData.phone) formData.append('phone', registrationData.phone);

      const response = await fetch('http://localhost:8000/api/v1/patients/register', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        const newPatientId = result.patient_id;
        
        toast({
          title: "Registration Successful! 🎉",
          description: `Welcome ${registrationData.name}! Your Patient ID is: ${newPatientId}`,
        });
        
        // Auto-login the new patient
        setSelectedPatientId(newPatientId);
        setIsPatientAuthenticated(true);
        setUserRole('patient');
        setShowRegistration(false);
        
        // Reset form
        setRegistrationData({
          name: '',
          age: '',
          gender: '',
          email: '',
          phone: ''
        });
        
      } else {
        const error = await response.json();
        toast({
          title: "Registration Failed",
          description: error.detail || "Failed to register patient",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error registering patient:', error);
      toast({
        title: "Error",
        description: "Failed to register patient. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  // If showing registration form
  if (showRegistration) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowRegistration(false);
                  setUserRole(null);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1 text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <UserPlus className="h-6 w-6" />
                  Patient Registration
                </CardTitle>
                <CardDescription>
                  Create your medical profile to get started
                </CardDescription>
              </div>
              <div className="w-10"></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={registrationData.name}
                onChange={(e) => setRegistrationData({...registrationData, name: e.target.value})}
                placeholder="Enter your full name"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="age">Age *</Label>
              <Input
                id="age"
                type="number"
                value={registrationData.age}
                onChange={(e) => setRegistrationData({...registrationData, age: e.target.value})}
                placeholder="Enter your age"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="gender">Gender *</Label>
              <Select value={registrationData.gender} onValueChange={(value) => setRegistrationData({...registrationData, gender: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="email">Email (Optional)</Label>
              <Input
                id="email"
                type="email"
                value={registrationData.email}
                onChange={(e) => setRegistrationData({...registrationData, email: e.target.value})}
                placeholder="Enter your email"
              />
            </div>
            
            <div>
              <Label htmlFor="phone">Phone (Optional)</Label>
              <Input
                id="phone"
                value={registrationData.phone}
                onChange={(e) => setRegistrationData({...registrationData, phone: e.target.value})}
                placeholder="Enter your phone number"
              />
            </div>
            
            <div className="pt-4">
              <Button 
                onClick={registerNewPatient}
                className="w-full"
                disabled={isRegistering || !registrationData.name || !registrationData.age || !registrationData.gender}
              >
                {isRegistering ? "Registering..." : "Register & Get My Patient ID"}
              </Button>
            </div>
            
            <div className="text-sm text-gray-500 text-center">
              * Required fields
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If no role selected, show role selection
  if (!userRole) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <FileText className="h-6 w-6" />
              Medical Files
            </CardTitle>
            <CardDescription>
              Please select your role to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => {
                setShowRegistration(true);
              }}
              className="w-full"
              variant="default"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              New Patient Registration
            </Button>
            <Button
              onClick={() => setUserRole('patient')}
              className="w-full"
              variant="outline"
            >
              <User className="h-4 w-4 mr-2" />
              Existing Patient Login
            </Button>
            <Button
              onClick={() => setUserRole('doctor')}
              className="w-full"
              variant="outline"
            >
              <UserCheck className="h-4 w-4 mr-2" />
              I am a Doctor
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Medical Files Management</h1>
          <p className="text-gray-600">
            {userRole === 'doctor' ? 'Manage patient medical files and generate AI summaries' : 'Upload and manage your medical files'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={userRole === 'doctor' ? 'default' : 'secondary'}>
            {userRole === 'doctor' ? <UserCheck className="h-3 w-3 mr-1" /> : <User className="h-3 w-3 mr-1" />}
            {userRole === 'doctor' ? 'Doctor' : 'Patient'}
          </Badge>
          <Button
            onClick={() => {
              setUserRole(null);
              setSelectedPatientId("");
              setIsPatientAuthenticated(false);
              setPatientFiles([]);
              setAiSummary("");
            }}
            variant="outline"
            size="sm"
          >
            Switch Role
          </Button>
        </div>
      </div>

      {/* Patient Selection (for doctors) or auto-select for patients */}
      {userRole === 'doctor' && (
        <Card>
          <CardHeader>
            <CardTitle>Select Patient</CardTitle>
            <CardDescription>
              Choose a patient to view their medical files 
              ({doctorPatients.length} patients total)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingPatients ? (
              <div className="text-center py-4">Loading patients...</div>
            ) : (
              <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a patient..." />
                </SelectTrigger>
                <SelectContent>
                  {doctorPatients.map((patient) => (
                    <SelectItem key={patient.patient_id} value={patient.patient_id}>
                      {patient.name} (ID: {patient.patient_id}) - Files: {patient.file_count}
                      {patient.last_activity && ` - Last activity: ${new Date(patient.last_activity).toLocaleDateString()}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {doctorPatients.length === 0 && !isLoadingPatients && (
              <div className="text-center py-4 text-gray-500">
                No patients registered yet
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {userRole === 'patient' && !isPatientAuthenticated && (
        <Card>
          <CardHeader>
            <CardTitle>Patient ID</CardTitle>
            <CardDescription>Enter your patient ID to access your files</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter your patient ID (e.g., PT001)"
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
              />
              <Button 
                onClick={() => {
                  if (selectedPatientId.trim()) {
                    setIsPatientAuthenticated(true);
                    loadPatientFiles();
                  } else {
                    toast({
                      title: "Error",
                      description: "Please enter a valid patient ID",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={!selectedPatientId.trim()}
              >
                Access Files
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {((userRole === 'doctor' && selectedPatientId) || (userRole === 'patient' && isPatientAuthenticated)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* File Upload and Management */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Medical Files
                </CardTitle>
                <CardDescription>
                  Upload medical documents for {userRole === 'doctor' ? 'the patient' : 'yourself'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
                    onChange={handleFileUpload}
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-lg font-medium">Click to upload files</p>
                    <p className="text-sm text-gray-500 mb-2">
                      Support for PDF, DOC, DOCX, JPG, PNG, TXT files
                    </p>
                    <p className="text-xs text-blue-600">
                      💡 For best AI analysis, use text files (.txt) or text-based PDFs
                    </p>
                  </label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Medical Files
                  {isLoadingFiles && <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {patientFiles.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No medical files uploaded yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {patientFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-blue-500" />
                          <div>
                            <p className="font-medium">{file.filename}</p>
                            <p className="text-sm text-gray-500">
                              Uploaded on {new Date(file.upload_date).toLocaleDateString()} • Size: {(file.file_size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{file.file_type}</Badge>
                          <Button size="sm" variant="outline">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => deleteFile(file.id, file.filename)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AI Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  AI Medical Summary
                </CardTitle>
                <CardDescription>
                  Generate comprehensive AI analysis of patient's medical files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={generateAISummary}
                  disabled={isGeneratingSummary || patientFiles.length === 0}
                  className="w-full"
                >
                  {isGeneratingSummary ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Generating Summary...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-2" />
                      Generate AI Summary
                    </>
                  )}
                </Button>

                {aiSummary && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">AI Analysis</h3>
                    <div className="text-blue-800 whitespace-pre-wrap text-sm">
                      {aiSummary}
                    </div>
                  </div>
                )}

                {patientFiles.length === 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>No Files Available</AlertTitle>
                    <AlertDescription>
                      Upload medical files to generate an AI summary.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* AI Chatbot for Doctors */}
            {userRole === 'doctor' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5" />
                    AI Medical Assistant
                  </CardTitle>
                  <CardDescription>
                    Ask questions about the patient's medical condition, treatment history, or get recommendations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Toggle Chat Button */}
                  <Button
                    onClick={() => setShowChatbot(!showChatbot)}
                    variant={showChatbot ? "secondary" : "default"}
                    className="w-full"
                    disabled={!selectedPatientId || patientFiles.length === 0}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    {showChatbot ? "Hide Chat" : "Start Chat with AI"}
                  </Button>

                  {/* Chat Interface */}
                  {showChatbot && (
                    <div className="space-y-4">
                      {/* Chat Messages */}
                      <div className="bg-gray-50 border rounded-lg p-4 max-h-96 overflow-y-auto">
                        {chatMessages.length === 0 ? (
                          <div className="text-center text-gray-500 py-8">
                            <MessageCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                            <p>Start a conversation with the AI about this patient</p>
                            <p className="text-sm mt-1">Example: "What are the main concerns for this patient?" or "What medications is this patient taking?"</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {chatMessages.map((message) => (
                              <div
                                key={message.id}
                                className={`flex ${message.sender === 'doctor' ? 'justify-end' : 'justify-start'}`}
                              >
                                <div
                                  className={`max-w-[80%] p-3 rounded-lg ${
                                    message.sender === 'doctor'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white border border-gray-200'
                                  }`}
                                >
                                  <div className="text-sm whitespace-pre-wrap">
                                    {message.text}
                                  </div>
                                  <div
                                    className={`text-xs mt-1 ${
                                      message.sender === 'doctor'
                                        ? 'text-blue-100'
                                        : 'text-gray-500'
                                    }`}
                                  >
                                    {message.sender === 'doctor' ? 'You' : 'AI Assistant'} • {message.timestamp}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {isAsking && (
                              <div className="flex justify-start">
                                <div className="bg-white border border-gray-200 p-3 rounded-lg">
                                  <div className="flex items-center space-x-2">
                                    <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                                    <span className="text-sm text-gray-600">AI is thinking...</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Question Input */}
                      <div className="space-y-2">
                        <div className="flex space-x-2">
                          <Input
                            placeholder="Ask a question about this patient... (e.g., 'What are the main health concerns?')"
                            value={currentQuestion}
                            onChange={(e) => setCurrentQuestion(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                askAIQuestion();
                              }
                            }}
                            disabled={isAsking}
                            className="flex-1"
                          />
                          <Button
                            onClick={askAIQuestion}
                            disabled={isAsking || !currentQuestion.trim()}
                            size="sm"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {chatMessages.length > 0 && (
                          <div className="flex justify-between">
                            <Button
                              onClick={clearChat}
                              variant="outline"
                              size="sm"
                              className="text-gray-600"
                            >
                              Clear Chat
                            </Button>
                            <span className="text-xs text-gray-500 self-center">
                              Press Enter to send
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Chat Tips */}
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>AI Chat Tips</AlertTitle>
                        <AlertDescription className="text-sm">
                          • Ask specific questions about symptoms, treatments, or test results
                          • Request medication reviews or drug interaction checks
                          • Get recommendations for follow-up care or monitoring
                          • Ask for explanations of medical terminology in the records
                        </AlertDescription>
                      </Alert>

                      {!selectedPatientId && (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Select Patient First</AlertTitle>
                          <AlertDescription>
                            Please select a patient to start chatting with the AI.
                          </AlertDescription>
                        </Alert>
                      )}

                      {patientFiles.length === 0 && selectedPatientId && (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>No Medical Files</AlertTitle>
                          <AlertDescription>
                            This patient has no medical files uploaded. Upload files to enable AI chat.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
