import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, User, UserCheck, Brain, Download, AlertCircle } from "lucide-react";

interface PatientFile {
  id: string;
  filename: string;
  file_type: string;
  upload_date: string;
  uploaded_by: string;
  file_path: string;
}

export default function PatientDocuments() {
  const { toast } = useToast();
  const [userRole, setUserRole] = useState<'patient' | 'doctor' | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [patientFiles, setPatientFiles] = useState<PatientFile[]>([]);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Sample patient data for doctor role
  const patients = [
    { id: "PT001", name: "John Doe", lastVisit: "2024-01-15" },
    { id: "PT002", name: "Jane Smith", lastVisit: "2024-01-12" },
    { id: "PT003", name: "Mike Johnson", lastVisit: "2024-01-10" },
  ];

  // Load patient files
  useEffect(() => {
    if (selectedPatientId) {
      loadPatientFiles();
    }
  }, [selectedPatientId]);

  const loadPatientFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch(`http://localhost:8000/medical-files/${selectedPatientId}/files`);
      if (response.ok) {
        const files = await response.json();
        setPatientFiles(files);
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
      formData.append('patient_id', selectedPatientId);
      formData.append('uploaded_by', userRole === 'doctor' ? 'Dr. Smith' : 'Patient');

      try {
        const response = await fetch('http://localhost:8000/medical-files/upload', {
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
      const response = await fetch(`http://localhost:8000/medical-files/${selectedPatientId}/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
              onClick={() => setUserRole('patient')}
              className="w-full"
              variant="outline"
            >
              <User className="h-4 w-4 mr-2" />
              I am a Patient
            </Button>
            <Button
              onClick={() => setUserRole('doctor')}
              className="w-full"
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
            <CardDescription>Choose a patient to view their medical files</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a patient..." />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.name} (ID: {patient.id}) - Last visit: {patient.lastVisit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {userRole === 'patient' && !selectedPatientId && (
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
              <Button onClick={() => {
                if (selectedPatientId) {
                  loadPatientFiles();
                }
              }}>
                Access Files
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedPatientId && (
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
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={handleFileUpload}
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-lg font-medium">Click to upload files</p>
                    <p className="text-sm text-gray-500">
                      Support for PDF, DOC, DOCX, JPG, PNG files
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
                              Uploaded by {file.uploaded_by} on {new Date(file.upload_date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{file.file_type}</Badge>
                          <Button size="sm" variant="outline">
                            <Download className="h-4 w-4" />
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
          </div>
        </div>
      )}
    </div>
  );
}
