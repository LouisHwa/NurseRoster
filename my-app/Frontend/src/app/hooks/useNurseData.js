// hooks/useNurseData.js
import { useState, useEffect } from 'react';

export function useNurseData() {
  const [nurses, setNurses] = useState([]);
  const [nurseLookup, setNurseLookup] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchNurseData() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch("/api/nurse-data");
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || "Failed to fetch nurse data");
        }
        
        console.log(`✅ Loaded ${data.count} nurses from S3`);
        
        setNurses(data.nurseData);
        setNurseLookup(data.nurseLookup);
        
      } catch (err) {
        console.error("❌ Error loading nurse data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchNurseData();
  }, []);

  return {
    nurses,
    nurseLookup,
    loading,
    error,
    refetch: () => fetchNurseData()
  };
}

// Utility functions for nurse data
export const nurseUtils = {
  // Get nurse by ID
  getNurseById: (nurseLookup, nurseId) => {
    return nurseLookup[nurseId] || null;
  },

  // Get nurse name by ID
  getNurseName: (nurseLookup, nurseId) => {
    return nurseLookup[nurseId]?.name || nurseId;
  },

  // Filter nurses by skill
  filterBySkill: (nurses, skill) => {
    return nurses.filter(nurse => 
      nurse.skills.some(s => s.toLowerCase().includes(skill.toLowerCase()))
    );
  },

  // Filter nurses by experience level
  filterByExperience: (nurses, minYears = 0, maxYears = Infinity) => {
    return nurses.filter(nurse => 
      nurse.experience_years >= minYears && nurse.experience_years <= maxYears
    );
  },

  // Filter nurses by seniority level
  filterBySeniority: (nurses, level) => {
    return nurses.filter(nurse => 
      nurse.seniority_level === level
    );
  },

  // Get nurses with specific skills
  getNursesWithSkills: (nurses, requiredSkills = []) => {
    return nurses.filter(nurse =>
      requiredSkills.every(skill =>
        nurse.skills.some(nurseSkill =>
          nurseSkill.toLowerCase().includes(skill.toLowerCase())
        )
      )
    );
  }
};