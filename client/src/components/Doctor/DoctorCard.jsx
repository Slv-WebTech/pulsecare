import { Avatar } from "../ui/Avatar.jsx";
import Button from "../ui/Button.jsx";
import { MapPinIcon, ClockIcon, GlobeIcon } from "../ui/icons.jsx";

export default function DoctorCard({ doctor, onBook }) {
  return (
    <div className="card card-padded card-interactive doctor-card">
      <div className="doctor-card-top">
        <Avatar name={doctor.name} size="md" />
        <div>
          <h3 className="doctor-card-name">{doctor.name}</h3>
          <p className="doctor-card-specialization">{doctor.specialization}</p>
        </div>
      </div>

      <div className="doctor-card-meta">
        <div className="doctor-card-meta-row">
          <MapPinIcon />
          {doctor.location}
        </div>
        <div className="doctor-card-meta-row">
          <ClockIcon />
          {doctor.experience_years} {doctor.experience_years === 1 ? "year" : "years"} experience
        </div>
        {doctor.languages?.length > 0 && (
          <div className="doctor-card-meta-row">
            <GlobeIcon />
            {doctor.languages.join(", ")}
          </div>
        )}
      </div>

      {doctor.bio && <p className="doctor-card-bio">{doctor.bio}</p>}

      <div className="doctor-card-footer">
        <p className="doctor-card-fee">
          ${doctor.fee}
          <span> / visit</span>
        </p>
        {onBook && (
          <Button variant="primary" size="sm" onClick={() => onBook(doctor)}>
            Book appointment
          </Button>
        )}
      </div>
    </div>
  );
}
