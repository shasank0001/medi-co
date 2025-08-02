import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Shield, AlertTriangle, CheckCircle, X, Upload, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Drug {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
}

interface VerificationResult {
  overall: 'green' | 'yellow' | 'red';
  alerts: {
    severity: 'critical' | 'advisory';
    message: string;
    recommendation: string;
  }[];
  alternatives?: {
    drug: string;
    reason: string;
    notes: string;
  }[];
}

export default function PrescriptionVerifier() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [clinicalContext, setClinicalContext] = useState("");
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [drugs, setDrugs] = useState<Drug[]>([
    { id: "1", name: "", dosage: "", frequency: "" }
  ]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);

  const addDrug = () => {
    const newDrug: Drug = {
      id: Date.now().toString(),
      name: "",
      dosage: "",
      frequency: ""
    };
    setDrugs([...drugs, newDrug]);
  };

  const removeDrug = (id: string) => {
    if (drugs.length > 1) {
      setDrugs(drugs.filter(drug => drug.id !== id));
    }
  };

  const updateDrug = (id: string, field: keyof Omit<Drug, 'id'>, value: string) => {
    setDrugs(drugs.map(drug => 
      drug.id === id ? { ...drug, [field]: value } : drug
    ));
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.type === 'application/pdf') {
        // For PDF files, we'll use FileReader to read as text
        // Note: This is a basic approach. For better PDF parsing, you'd use pdf-js
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const uint8Array = new Uint8Array(arrayBuffer);
            let text = '';
            
            // Basic text extraction - look for readable text in PDF
            for (let i = 0; i < uint8Array.length; i++) {
              const char = String.fromCharCode(uint8Array[i]);
              // Only include printable ASCII characters
              if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
                text += char;
              } else if (char.charCodeAt(0) === 10 || char.charCodeAt(0) === 13) {
                text += ' '; // Replace line breaks with spaces
              }
            }
            
            // Clean up the extracted text
            text = text
              .replace(/\s+/g, ' ') // Replace multiple spaces with single space
              .replace(/[^\w\s.,!?;:()\-]/g, '') // Remove special characters except basic punctuation
              .trim();
            
            if (text.length < 10) {
              resolve(`[PDF Document: ${file.name}]\n\nUploaded PDF document. Please manually enter the clinical information from this document as the automatic text extraction was limited.`);
            } else {
              resolve(`[Extracted from PDF: ${file.name}]\n\n${text.substring(0, 2000)}${text.length > 2000 ? '...\n\n[Content truncated - Please review and edit as needed]' : ''}`);
            }
          } catch (error) {
            resolve(`[PDF Document: ${file.name}]\n\nUploaded PDF document. Please manually enter the clinical information from this document.`);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read PDF file'));
        reader.readAsArrayBuffer(file);
      } else if (file.type.includes('text') || 
                 file.type === 'application/msword' ||
                 file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // For text and Word files
        const reader = new FileReader();
        reader.onload = (e) => {
          let text = e.target?.result as string;
          
          // Basic cleanup for Word documents (remove some common artifacts)
          if (file.type.includes('word') || file.name.toLowerCase().endsWith('.doc') || file.name.toLowerCase().endsWith('.docx')) {
            text = `[Extracted from Word Document: ${file.name}]\n\n${text}`;
          }
          
          // Limit text length
          if (text.length > 5000) {
            text = text.substring(0, 5000) + '\n\n[Content truncated - Please review and edit as needed]';
          }
          
          resolve(text);
        };
        reader.onerror = () => reject(new Error('Failed to read document file'));
        reader.readAsText(file);
      } else {
        reject(new Error('Unsupported file type. Please upload a PDF, Word document, or text file.'));
      }
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    // Check file type
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Unsupported File Type",
        description: "Please upload a PDF, Word document, or text file.",
        variant: "destructive",
      });
      return;
    }

    setIsExtractingText(true);
    try {
      const extractedText = await extractTextFromFile(file);
      setClinicalContext(extractedText);
      setUploadedFileName(file.name);
      toast({
        title: "File Uploaded Successfully",
        description: `Text extracted from ${file.name}`,
        variant: "default",
      });
    } catch (error) {
      console.error('Error extracting text:', error);
      toast({
        title: "Extraction Failed",
        description: "Failed to extract text from the file. Please try again or enter text manually.",
        variant: "destructive",
      });
    } finally {
      setIsExtractingText(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const clearUploadedFile = () => {
    setClinicalContext("");
    setUploadedFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleVerifyPrescription = async () => {
    // Validation
    if (!patientAge || !patientGender || !clinicalContext) {
      toast({
        title: "Missing Information",
        description: "Please fill in all patient details and clinical context.",
        variant: "destructive",
      });
      return;
    }

    const incompleteDrugs = drugs.filter(drug => !drug.name || !drug.dosage || !drug.frequency);
    if (incompleteDrugs.length > 0) {
      toast({
        title: "Incomplete Drug Information",
        description: "Please complete all drug details before verification.",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);

    try {
      // Call the real backend endpoint
      const response = await fetch('http://localhost:8000/api/v1/verify-prescription/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patient_age: parseInt(patientAge),
          patient_gender: patientGender,
          clinical_context: clinicalContext,
          drugs: drugs.map(drug => ({
            name: drug.name,
            dosage: drug.dosage,
            frequency: drug.frequency
          }))
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setVerificationResult(result);
      
      toast({
        title: "Verification Complete",
        description: `Analysis completed for ${drugs.length} medication(s).`,
        variant: "default",
      });
    } catch (error) {
      console.error('Error verifying prescription:', error);
      toast({
        title: "Verification Failed",
        description: "Failed to verify prescription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-medical-blue rounded-lg flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Prescription Verifier</h1>
          <p className="text-muted-foreground">Clinical decision support for safe prescribing</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section - Left Column */}
        <div className="space-y-6">
          {/* Patient Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Patient Details</CardTitle>
              <CardDescription>Enter basic patient information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="age">Patient Age</Label>
                  <Input
                    id="age"
                    type="number"
                    placeholder="Enter age"
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">Patient Gender</Label>
                  <Select value={patientGender} onValueChange={setPatientGender}>
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
              </div>
            </CardContent>
          </Card>

          {/* Clinical Context */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Clinical Context</CardTitle>
              <CardDescription>Diagnosis, symptoms, lab findings, medical history</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* File Upload Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="file-upload" className="text-sm font-medium">
                    Upload Medical Document (Optional)
                  </Label>
                  {uploadedFileName && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearUploadedFile}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  <Input
                    ref={fileInputRef}
                    id="file-upload"
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                    disabled={isExtractingText}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExtractingText}
                    className="flex-1"
                  >
                    {isExtractingText ? (
                      <>
                        <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Extracting...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Document
                      </>
                    )}
                  </Button>
                </div>

                {uploadedFileName && (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Uploaded: {uploadedFileName}
                    </span>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Supported formats: PDF, Word documents, text files (max 10MB)
                </p>
              </div>

              {/* Text Area */}
              <div className="space-y-2">
                <Label htmlFor="clinical-context">
                  Clinical Information
                </Label>
                <Textarea
                  id="clinical-context"
                  placeholder="Enter patient's clinical context, diagnosis, symptoms, relevant lab findings, allergies, and medical history... or upload a document above."
                  value={clinicalContext}
                  onChange={(e) => setClinicalContext(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Prescription Input */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Prescription Details</CardTitle>
              <CardDescription>Enter all medications to be prescribed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {drugs.map((drug, index) => (
                <div key={drug.id} className="p-4 border border-clinical-border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Drug #{index + 1}</h4>
                    {drugs.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDrug(drug.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Drug Name</Label>
                      <Input
                        placeholder="e.g., Metformin"
                        value={drug.name}
                        onChange={(e) => updateDrug(drug.id, 'name', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dosage</Label>
                      <Input
                        placeholder="e.g., 500mg"
                        value={drug.dosage}
                        onChange={(e) => updateDrug(drug.id, 'dosage', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Input
                        placeholder="e.g., Twice daily"
                        value={drug.frequency}
                        onChange={(e) => updateDrug(drug.id, 'frequency', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              <Button variant="outline" onClick={addDrug} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Another Drug
              </Button>
              
              <Button 
                variant="medical" 
                onClick={handleVerifyPrescription}
                disabled={isVerifying}
                className="w-full h-12"
              >
                {isVerifying ? "Verifying..." : "Verify Prescription"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results Section - Right Column */}
        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-lg">Verification Results</CardTitle>
              <CardDescription>AI-powered safety analysis</CardDescription>
            </CardHeader>
            <CardContent>
              {!verificationResult ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Click "Verify Prescription" to analyze the medication safety</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Overall Status */}
                  {verificationResult.overall === 'green' && (
                    <Alert className="border-success bg-success/5">
                      <CheckCircle className="w-4 h-4 text-success" />
                      <AlertDescription className="text-success font-medium">
                        ✅ Green: No critical issues found
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Critical Alerts */}
                  {verificationResult.alerts
                    .filter(alert => alert.severity === 'critical')
                    .map((alert, index) => (
                      <Alert key={index} variant="destructive">
                        <AlertTriangle className="w-4 h-4" />
                        <AlertDescription>
                          <div className="space-y-2">
                            <p className="font-medium">🚨 Critical Alert: {alert.message}</p>
                            <p className="text-sm"><strong>Recommended Action:</strong> {alert.recommendation}</p>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}

                  {/* Advisory Alerts */}
                  {verificationResult.alerts
                    .filter(alert => alert.severity === 'advisory')
                    .map((alert, index) => (
                      <Alert key={index} className="border-warning bg-warning/5">
                        <AlertTriangle className="w-4 h-4 text-warning" />
                        <AlertDescription>
                          <div className="space-y-2">
                            <p className="font-medium text-warning">🔔 Advisory: {alert.message}</p>
                            <p className="text-sm"><strong>Recommended Action:</strong> {alert.recommendation}</p>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))}

                  {/* Alternative Suggestions */}
                  {verificationResult.alternatives && (
                    <div className="space-y-3">
                      <h4 className="font-medium">Alternative Suggestions</h4>
                      <div className="border border-clinical-border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-3 font-medium">Alternative Drug</th>
                              <th className="text-left p-3 font-medium">Reason</th>
                              <th className="text-left p-3 font-medium">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {verificationResult.alternatives.map((alt, index) => (
                              <tr key={index} className="border-t border-clinical-border">
                                <td className="p-3 font-medium">{alt.drug}</td>
                                <td className="p-3">{alt.reason}</td>
                                <td className="p-3 text-muted-foreground">{alt.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}